import {
  SCHEMA_VERSIONS,
  normalizeAddress,
  normalizeBytes32,
  normalizeUIntString,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type UnixMillis
} from "@tyrpay/sdk-core";
import type { ContractLike, SellerAgent } from "@tyrpay/seller-sdk";
import { SellerSkillToolError, wrapSellerSkillError } from "./errors.js";
import type {
  AcceptTaskResult,
  CheckSettlementResult,
  ExecuteTaskResult,
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
  const { agent, contract, verifier } = config;
  return [
    acceptTaskTool(agent, contract, verifier),
    executeTaskTool(agent),
    submitProofTool(agent, contract),
    checkSettlementTool(contract),
    readyTool(agent)
  ];
}

function acceptTaskTool(agent: SellerAgent, contract: ReadableContractLike, verifier: string): SellerTool<AcceptTaskResult> {
  return {
    name: "tyrpay_accept_task",
    description:
      "Accept a TyrPay task as a seller: build the execution terms, upload them to storage, and submit them on-chain. " +
      "Use this after the buyer shares a taskId and you agree to perform the task. " +
      "Returns the commitment plus seller-facing status fields so the next step is clear.",
    inputSchema: {
      type: "object",
      required: ["taskId", "host", "path", "method", "allowedModels", "minTotalTokens", "deadline"],
      properties: {
        taskId: { type: "string", description: "The task ID to accept (bytes32 hex from the buyer)" },
        host: { type: "string", description: "API hostname you will call (e.g. 'api.openai.com')" },
        path: { type: "string", description: "API endpoint path (e.g. '/v1/chat/completions')" },
        method: { type: "string", description: "HTTP method (e.g. 'POST')" },
        allowedModels: {
          type: "array",
          items: { type: "string" },
          description: "AI model names you may use (e.g. ['gpt-4o', 'gpt-4o-mini'])",
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
        const verifierAddress = normalizeAddress(verifier, "verifier");
        const taskId = normalizeBytes32(i.taskId, "taskId");

        const commitment: ExecutionCommitment = {
          schemaVersion: SCHEMA_VERSIONS.executionCommitment,
          taskId,
          buyer: buyerAddress,
          seller: sellerAddress,
          verifier: verifierAddress,
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

function executeTaskTool(agent: SellerAgent): SellerTool<ExecuteTaskResult> {
  return {
    name: "tyrpay_execute_task",
    description:
      "Execute a funded TyrPay task via a zkTLS-proven API call. " +
      "Performs the upstream request with cryptographic proof, then uploads the proof and delivery receipt to storage. " +
      "Returns the receipt object needed for tyrpay_submit_proof.",
    inputSchema: {
      type: "object",
      required: ["commitment", "taskNonce", "callIndex", "request", "declaredModel"],
      properties: {
        commitment: {
          type: "object",
          description: "The ExecutionCommitment you submitted (returned by tyrpay_accept_task)"
        },
        taskNonce: {
          type: "string",
          description: "The task nonce bytes32 hex (from the on-chain task record)"
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

        const result = await agent.provenFetch({
          commitment: i.commitment as unknown as ExecutionCommitment,
          taskNonce: normalizeBytes32(i.taskNonce, "taskNonce"),
          callIndex: i.callIndex,
          request: i.request,
          declaredModel: i.declaredModel,
          ...(i.providerOptions ? { providerOptions: i.providerOptions } : {}),
          ...(i.provider ? { provider: i.provider } : {})
        });

        return {
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
      required: ["commitment", "receipts"],
      properties: {
        commitment: {
          type: "object",
          description: "The ExecutionCommitment for this task"
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
        const bundle = agent.buildProofBundle({ commitment: i.commitment as unknown as ExecutionCommitment, receipts: i.receipts as DeliveryReceipt[] });
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
