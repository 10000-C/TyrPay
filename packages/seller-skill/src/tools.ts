import {
  SCHEMA_VERSIONS,
  assertExecutionCommitment,
  hashExecutionCommitment,
  normalizeAddress,
  normalizeBytes32,
  normalizeUIntString,
  type Bytes32,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type URI,
  type UnixMillis
} from "@tyrpay/sdk-core";
import type { ContractLike, SellerAgent } from "@tyrpay/seller-sdk";
import { SellerSkillToolError, wrapSellerSkillError } from "./errors.js";
import type {
  AcceptTaskResult,
  CheckSettlementResult,
  ExecuteTaskResult,
  ModelEndpointDiscoveryResult,
  RawOnChainTask,
  ReadyResult,
  ReadableContractLike,
  SellerSkillConfig,
  SellerStatusView,
  SellerTool,
  SubmitProofResult
} from "./types.js";
import {
  validateAcceptTaskInput,
  validateCheckSettlementInput,
  validateExecuteTaskInput,
  validateModelEndpointDiscoveryInput,
  validateSubmitProofInput
} from "./validation.js";
import { isEmptyBytes32, normalizeRawOnChainTask } from "./contract.js";

const TASK_STATUS_NAMES = [
  "INTENT_CREATED",
  "COMMITMENT_SUBMITTED",
  "FUNDED",
  "PROOF_SUBMITTED",
  "SETTLED",
  "REFUNDED"
] as const;

function mapSellerUserStatus(status: string): SellerStatusView {
  switch (status) {
    case "INTENT_CREATED":
      return {
        userStatus: "READY_TO_ACCEPT",
        userMessage: "The buyer created the task. Accept it to submit your execution terms."
      };
    case "COMMITMENT_SUBMITTED":
      return {
        userStatus: "WAITING_FOR_BUYER_FUNDING",
        userMessage: "Your execution terms were submitted. Waiting for the buyer to approve and lock payment."
      };
    case "FUNDED":
      return {
        userStatus: "READY_TO_EXECUTE",
        userMessage: "Payment is locked. You can execute the task and produce proof."
      };
    case "PROOF_SUBMITTED":
      return {
        userStatus: "AWAITING_VERIFICATION",
        userMessage: "Proof was submitted. Waiting for final verification and payout."
      };
    case "SETTLED":
      return {
        userStatus: "PAID",
        userMessage: "The task was verified and payment was released to the seller."
      };
    case "REFUNDED":
      return {
        userStatus: "NOT_PAID_REFUNDED",
        userMessage: "The task ended in a refund to the buyer, so no seller payout was made."
      };
    default:
      return {
        userStatus: "UNKNOWN",
        userMessage: "Task status is unknown. Inspect the raw task fields for more detail."
      };
  }
}

export function createSellerTools(config: SellerSkillConfig): SellerTool[] {
  const { agent, contract } = config;
  const verifierSignerAddress = resolveVerifierSignerAddress(config);
  return [
    discoverModelEndpointTool(agent),
    acceptTaskTool(agent, contract, verifierSignerAddress),
    executeTaskTool(agent, contract),
    submitProofTool(agent, contract),
    checkSettlementTool(contract),
    readyTool(agent)
  ];
}

function resolveVerifierSignerAddress(config: SellerSkillConfig): string {
  const verifierSignerAddress = config.verifierSignerAddress ?? config.verifier;

  if (!verifierSignerAddress) {
    throw new SellerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message: "createSellerTools requires verifierSignerAddress.",
      suggestion: "Pass the registry-authorized verifier signer address, not a contract address or service URL.",
      retryable: false
    });
  }

  return verifierSignerAddress;
}

interface ModelEndpointDiscoveryAdapterLike {
  discoverModelEndpoints(input: {
    model: string;
    requestPath?: string;
    limit?: number;
    requireReachableEndpoint?: boolean;
  }): Promise<unknown[]>;
}

function discoverModelEndpointTool(agent: SellerAgent): SellerTool<ModelEndpointDiscoveryResult> {
  return {
    name: "tyrpay_discover_model_endpoint",
    description:
      "Discover reachable TeeTLS/TeeML endpoints for a requested model before accepting or executing a TyrPay task. " +
      "Use this for provider '0g-teetls' when you only know the desired model name and need the actual endpoint host/path and providerAddress. " +
      "The recommended result can be passed to tyrpay_accept_task as host/path/method/allowedModels and to tyrpay_execute_task as provider/providerOptions.",
    inputSchema: {
      type: "object",
      required: ["model"],
      properties: {
        model: {
          type: "string",
          description: "Exact model name to discover, as advertised by TeeTLS/TeeML service metadata."
        },
        provider: {
          type: "string",
          description: "Provider adapter to query. Defaults to '0g-teetls'."
        },
        requestPath: {
          type: "string",
          description: "OpenAI-compatible request path appended to provider base endpoint. Defaults to '/chat/completions'."
        },
        limit: {
          type: "number",
          description: "Maximum number of matching endpoints to return. Defaults to the adapter default."
        },
        requireReachableEndpoint: {
          type: "boolean",
          description: "Whether to only return endpoints that pass the adapter reachability probe."
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      try {
        const i = validateModelEndpointDiscoveryInput(input);
        const provider = i.provider ?? "0g-teetls";
        const adapter = resolveNamedAdapter(agent, provider);

        if (!isModelEndpointDiscoveryAdapter(adapter)) {
          throw new SellerSkillToolError({
            code: "CONFIGURATION_ERROR",
            message: `Provider '${provider}' does not expose model endpoint discovery.`,
            suggestion:
              "Configure SellerAgent with a 0G TeeTLS adapter version that implements discoverModelEndpoints, for example in zkTlsAdapters['0g-teetls'].",
            retryable: false
          });
        }

        const endpoints = await adapter.discoverModelEndpoints({
          model: i.model,
          ...(i.requestPath ? { requestPath: i.requestPath } : {}),
          ...(i.limit ? { limit: i.limit } : {}),
          ...(i.requireReachableEndpoint !== undefined ? { requireReachableEndpoint: i.requireReachableEndpoint } : {})
        });
        const normalizedEndpoints = endpoints.map((endpoint, index) => normalizeDiscoveredEndpoint(endpoint, provider, index));
        const recommended = normalizedEndpoints[0] ?? null;

        return {
          model: i.model,
          provider,
          endpoints: normalizedEndpoints,
          recommended,
          userStatus: recommended ? "ENDPOINT_READY" : "NO_ENDPOINT_FOUND",
          userMessage: recommended
            ? "A TeeTLS/TeeML endpoint was found. Use the recommended host, path, model, and providerOptions for the seller workflow."
            : "No matching TeeTLS/TeeML endpoint was found for this model."
        };
      } catch (error) {
        throw wrapSellerSkillError(error);
      }
    }
  };
}

function resolveNamedAdapter(agent: SellerAgent, provider: string): unknown {
  return agent.zkTlsAdapters?.[provider] ?? (agent.zkTlsAdapter.name === provider ? agent.zkTlsAdapter : undefined);
}

function isModelEndpointDiscoveryAdapter(adapter: unknown): adapter is ModelEndpointDiscoveryAdapterLike {
  return (
    adapter !== null &&
    typeof adapter === "object" &&
    typeof (adapter as { discoverModelEndpoints?: unknown }).discoverModelEndpoints === "function"
  );
}

function normalizeDiscoveredEndpoint(endpoint: unknown, provider: string, index: number) {
  if (endpoint === null || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    throw new SellerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message: `Discovered endpoint at index ${index} is not an object.`,
      field: `endpoints[${index}]`,
      received: endpoint,
      retryable: false
    });
  }

  const object = endpoint as Record<string, unknown>;
  const endpointUrl = expectEndpointUrl(object.endpoint, index);
  const model = expectDiscoveredString(object.model, `endpoints[${index}].model`, object.model);
  const method = typeof object.method === "string" && object.method.length > 0 ? object.method : "POST";

  return {
    provider: typeof object.provider === "string" && object.provider.length > 0 ? object.provider : provider,
    ...(typeof object.providerAddress === "string" && object.providerAddress.length > 0
      ? { providerAddress: object.providerAddress }
      : {}),
    endpoint: endpointUrl.toString(),
    host: typeof object.host === "string" && object.host.length > 0 ? object.host : endpointUrl.host,
    path: typeof object.path === "string" && object.path.length > 0 ? object.path : endpointUrl.pathname,
    method,
    model,
    ...(typeof object.requestPath === "string" && object.requestPath.length > 0 ? { requestPath: object.requestPath } : {}),
    ...(typeof object.serviceType === "string" || object.serviceType === null ? { serviceType: object.serviceType } : {}),
    ...(typeof object.verifiability === "string" || object.verifiability === null ? { verifiability: object.verifiability } : {}),
    ...(typeof object.reachable === "boolean" ? { reachable: object.reachable } : {}),
    ...(object.providerOptions !== undefined && object.providerOptions !== null && typeof object.providerOptions === "object" && !Array.isArray(object.providerOptions)
      ? { providerOptions: object.providerOptions as Record<string, unknown> }
      : {})
  };
}

function expectEndpointUrl(input: unknown, index: number): URL {
  const endpoint = expectDiscoveredString(input, `endpoints[${index}].endpoint`, input);
  try {
    return new URL(endpoint);
  } catch {
    throw new SellerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message: `Discovered endpoint at index ${index} is not a valid URL.`,
      field: `endpoints[${index}].endpoint`,
      received: endpoint,
      retryable: false
    });
  }
}

function expectDiscoveredString(input: unknown, field: string, received: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new SellerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message: `${field} must be a non-empty string.`,
      field,
      received,
      retryable: false
    });
  }

  return input;
}

function acceptTaskTool(
  agent: SellerAgent,
  contract: ReadableContractLike,
  verifierSignerAddress: string
): SellerTool<AcceptTaskResult> {
  return {
    name: "tyrpay_accept_task",
    description:
      "Accept a TyrPay task as a seller: build the execution terms, upload them to storage, and submit them on-chain. " +
      "Use this after the buyer shares a taskId and you agree to perform the task. " +
      "When the later execution provider is 0g-teetls, host/path/allowedModels must be the actual 0G TeeTLS endpoint and service metadata model the adapter will call. " +
      "Returns the commitment plus seller-facing status fields so the next step is clear.",
    inputSchema: {
      type: "object",
      required: ["taskId", "host", "path", "method", "allowedModels", "minTotalTokens", "deadline"],
      properties: {
        taskId: { type: "string", description: "The task ID to accept (bytes32 hex from the buyer)" },
        host: { type: "string", description: "API hostname you will call. For 0G TeeTLS, use the resolved 0G endpoint host, not a generic upstream host." },
        path: { type: "string", description: "API endpoint path. For 0G TeeTLS, use the resolved 0G endpoint path." },
        method: { type: "string", description: "HTTP method (e.g. 'POST')" },
        allowedModels: {
          type: "array",
          items: { type: "string" },
          description: "AI model names you may use. For 0G TeeTLS, include the model returned by 0G service metadata.",
          minItems: 1
        },
        minTotalTokens: {
          type: "number",
          description: "Minimum total tokens you guarantee to deliver"
        },
        deadline: {
          type: "string",
          description: "Your commitment deadline as Unix milliseconds string (must be <= task deadline)"
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      try {
        const i = validateAcceptTaskInput(input);

        const rawTask = normalizeRawOnChainTask(await contract.getTask(normalizeBytes32(i.taskId, "taskId")));
        const sellerAddress = normalizeAddress(await agent.signer.getAddress(), "seller");
        const buyerAddress = normalizeAddress(rawTask.buyer, "buyer");
        const normalizedVerifierSignerAddress = normalizeAddress(verifierSignerAddress, "verifierSignerAddress");
        const taskId = normalizeBytes32(i.taskId, "taskId");

        const commitment: ExecutionCommitment = {
          schemaVersion: SCHEMA_VERSIONS.executionCommitment,
          taskId,
          buyer: buyerAddress,
          seller: sellerAddress,
          verifier: normalizedVerifierSignerAddress,
          target: {
            host: i.host,
            path: i.path,
            method: i.method.toUpperCase()
          },
          allowedModels: i.allowedModels,
          minUsage: { totalTokens: i.minTotalTokens },
          deadline: normalizeUIntString(i.deadline, "deadline") as UnixMillis
        };

        const pointer = await agent.storageAdapter.putObject(commitment, { namespace: "commitments" });
        const result = await agent.submitCommitment(contract as ContractLike, commitment, pointer.uri);

        return {
          txHash: result.txHash,
          taskId: result.taskId,
          commitmentHash: result.commitmentHash,
          commitmentURI: result.commitmentURI,
          commitment,
          userStatus: "WAITING_FOR_BUYER_FUNDING",
          userMessage: "Execution terms were submitted. Wait for the buyer to approve and lock payment."
        };
      } catch (error) {
        throw wrapSellerSkillError(error);
      }
    }
  };
}

function executeTaskTool(agent: SellerAgent, contract: ReadableContractLike): SellerTool<ExecuteTaskResult> {
  return {
    name: "tyrpay_execute_task",
    description:
      "Execute a funded TyrPay task via a zkTLS-proven API call. " +
      "Performs the upstream request with cryptographic proof, then uploads the proof and delivery receipt to storage. " +
      "Returns the receipt object needed for tyrpay_submit_proof.",
    inputSchema: {
      type: "object",
      required: ["callIndex", "request", "declaredModel"],
      anyOf: [
        { required: ["taskId"] },
        { required: ["commitment", "taskNonce"] }
      ],
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to resume from chain and storage. Preferred for recoverable workflows."
        },
        commitment: {
          type: "object",
          description: "The ExecutionCommitment you submitted (returned by tyrpay_accept_task). Legacy mode; prefer taskId."
        },
        taskNonce: {
          type: "string",
          description: "The task nonce bytes32 hex (from the on-chain task record). Required only with commitment."
        },
        callIndex: {
          type: "number",
          description: "Zero-based index of this API call (use 0 for a single-call task)"
        },
        request: {
          type: "object",
          required: ["host", "path", "method"],
          description: "The API request to execute. host/path/method must match your commitment target.",
          properties: {
            host: { type: "string" },
            path: { type: "string" },
            method: { type: "string" },
            headers: { type: "object", additionalProperties: { type: "string" } },
            body: { description: "Optional request body (any JSON-serializable value)" }
          },
          additionalProperties: false
        },
        declaredModel: {
          type: "string",
          description: "The AI model name to use. It must be included in commitment.allowedModels."
        },
        providerOptions: {
          type: "object",
          description: "Optional zkTLS provider-specific parameters (e.g. providerAddress for 0G TeeTLS, Reclaim session options)"
        },
        provider: {
          type: "string",
          description: "zkTLS provider name to use (e.g. '0g-teetls', 'reclaim', 'mock'). Uses the default adapter if omitted."
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      try {
        const i = validateExecuteTaskInput(input);
        const execution = await resolveExecutionCommitment(agent, contract, i);

        const result = await agent.provenFetch({
          commitment: execution.commitment,
          taskNonce: execution.taskNonce,
          callIndex: i.callIndex,
          request: i.request,
          declaredModel: i.declaredModel,
          ...(i.providerOptions ? { providerOptions: i.providerOptions } : {}),
          ...(i.provider ? { provider: i.provider } : {})
        });

        return {
          taskId: execution.commitment.taskId,
          taskNonce: execution.taskNonce,
          commitment: execution.commitment,
          receipt: result.receipt,
          receiptURI: result.receiptPointer.uri,
          receiptHash: result.receiptPointer.hash,
          rawProofURI: result.rawProofPointer.uri,
          rawProofHash: result.rawProofPointer.hash,
          userStatus: "PROOF_CAPTURED",
          userMessage: "Execution proof was captured. Submit proof to move the task into verification."
        };
      } catch (error) {
        throw wrapSellerSkillError(error);
      }
    }
  };
}

function submitProofTool(agent: SellerAgent, contract: ReadableContractLike): SellerTool<SubmitProofResult> {
  return {
    name: "tyrpay_submit_proof",
    description:
      "Assemble all delivery receipts into a proof bundle, upload it to storage, and submit the proof bundle hash on-chain. " +
      "Use this after all required execution calls are complete to move the task into final verification.",
    inputSchema: {
      type: "object",
      required: ["receipts"],
      anyOf: [
        { required: ["taskId"] },
        { required: ["commitment"] }
      ],
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to resume from chain and storage. Preferred for recoverable workflows."
        },
        commitment: {
          type: "object",
          description: "The ExecutionCommitment for this task. Legacy mode; prefer taskId."
        },
        receipts: {
          type: "array",
          description: "Array of receipt objects returned by tyrpay_execute_task, one per API call",
          items: { type: "object" },
          minItems: 1
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      try {
        const i = validateSubmitProofInput(input);
        const commitment = await resolveProofCommitment(agent, contract, i);
        const bundle = agent.buildProofBundle({ commitment, receipts: i.receipts as DeliveryReceipt[] });
        const { pointer } = await agent.uploadProofBundle(bundle);
        const result = await agent.submitProofBundleHash(
          contract as ContractLike,
          bundle.taskId,
          pointer.hash,
          pointer.uri
        );
        return {
          txHash: result.txHash,
          taskId: result.taskId,
          proofBundleHash: result.proofBundleHash,
          proofBundleURI: result.proofBundleURI,
          userStatus: "AWAITING_VERIFICATION",
          userMessage: "Proof was submitted. Wait for verification to release payment."
        };
      } catch (error) {
        throw wrapSellerSkillError(error);
      }
    }
  };
}

async function resolveExecutionCommitment(
  agent: SellerAgent,
  contract: ReadableContractLike,
  input: { taskId?: string; commitment?: Record<string, unknown>; taskNonce?: string }
): Promise<{ commitment: ExecutionCommitment; taskNonce: Bytes32 }> {
  if (input.taskId) {
    const { task, commitment } = await loadCommitmentForTask(agent, contract, input.taskId);
    return {
      commitment,
      taskNonce: task.taskNonce as Bytes32
    };
  }

  assertExecutionCommitment(input.commitment);
  return {
    commitment: input.commitment,
    taskNonce: normalizeBytes32(input.taskNonce!, "taskNonce")
  };
}

async function resolveProofCommitment(
  agent: SellerAgent,
  contract: ReadableContractLike,
  input: { taskId?: string; commitment?: Record<string, unknown> }
): Promise<ExecutionCommitment> {
  if (input.taskId) {
    return (await loadCommitmentForTask(agent, contract, input.taskId)).commitment;
  }

  assertExecutionCommitment(input.commitment);
  return input.commitment;
}

async function loadCommitmentForTask(
  agent: SellerAgent,
  contract: ReadableContractLike,
  taskId: string
): Promise<{ task: RawOnChainTask; commitment: ExecutionCommitment }> {
  const task = normalizeRawOnChainTask(await contract.getTask(normalizeBytes32(taskId, "taskId")));

  if (isEmptyBytes32(task.commitmentHash) || task.commitmentURI.length === 0) {
    throw new SellerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message: `Task ${task.taskId} does not have a submitted commitment URI and hash.`,
      suggestion: "Wait until tyrpay_accept_task succeeds, then retry with the same taskId.",
      retryable: false
    });
  }

  const commitment = await agent.storageAdapter.getObject<ExecutionCommitment>(
    {
      uri: task.commitmentURI as URI,
      hash: task.commitmentHash as Bytes32
    },
    {
      expectedHash: task.commitmentHash as Bytes32
    }
  );

  assertExecutionCommitment(commitment);

  const computedHash = hashExecutionCommitment(commitment);
  if (computedHash !== task.commitmentHash) {
    throw new SellerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message: `Commitment hash mismatch for task ${task.taskId}.`,
      suggestion: "Fetch the exact canonical commitment object from the submitted commitmentURI.",
      retryable: false
    });
  }

  return { task, commitment };
}

function checkSettlementTool(contract: ReadableContractLike): SellerTool<CheckSettlementResult> {
  return {
    name: "tyrpay_check_settlement",
    description:
      "Check whether a TyrPay task has been settled and payment released to the seller. " +
      "Returns both raw protocol status and seller-facing status fields so agents can explain payout progress clearly.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "The task ID to check settlement for (bytes32 hex)" }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      try {
        const i = validateCheckSettlementInput(input);
        const task = normalizeRawOnChainTask(await contract.getTask(normalizeBytes32(i.taskId, "taskId")));
        const statusCode = Number(task.status);
        const status = TASK_STATUS_NAMES[statusCode] ?? "UNKNOWN";

        return {
          taskId: i.taskId,
          status,
          settled: status === "SETTLED",
          refunded: status === "REFUNDED",
          proofSubmittedAt: task.proofSubmittedAtMs > 0n ? task.proofSubmittedAtMs.toString() : null,
          proofBundleHash: !isEmptyBytes32(task.proofBundleHash) ? task.proofBundleHash : null,
          proofBundleURI: task.proofBundleURI || null,
          settledAt: task.settledAtMs > 0n ? task.settledAtMs.toString() : null,
          refundedAt: task.refundedAtMs > 0n ? task.refundedAtMs.toString() : null,
          reportHash: !isEmptyBytes32(task.reportHash) ? task.reportHash : null,
          ...mapSellerUserStatus(status)
        };
      } catch (error) {
        throw wrapSellerSkillError(error);
      }
    }
  };
}

function readyTool(agent: SellerAgent): SellerTool<ReadyResult> {
  return {
    name: "tyrpay_ready",
    description:
      "Run a lightweight readiness check for the configured TyrPay seller agent. " +
      "Use this before the first task workflow to verify signer access and storage adapter connectivity.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    async execute(input: unknown) {
      try {
        if (input !== undefined && (typeof input !== "object" || input === null || Object.keys(input as Record<string, unknown>).length > 0)) {
          throw new SellerSkillToolError({
            code: "VALIDATION_ERROR",
            message: "tyrpay_ready does not accept arguments.",
            field: "input",
            received: input,
            suggestion: "Call the tool with an empty object.",
            retryable: false
          });
        }

        const signerAddress = await agent.signer.getAddress();

        return {
          ok: true,
          signerAddress,
          userStatus: "READY",
          userMessage: "Seller signer is reachable and storage adapter is configured."
        };
      } catch (error) {
        throw wrapSellerSkillError(error);
      }
    }
  };
}
