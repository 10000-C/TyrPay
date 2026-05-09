import {
  SCHEMA_VERSIONS,
  normalizeAddress,
  normalizeBytes32,
  normalizeUIntString,
  type ExecutionCommitment,
  type DeliveryReceipt,
  type UnixMillis
} from "@fulfillpay/sdk-core";
import type { SellerAgent, ContractLike } from "@fulfillpay/seller-sdk";
import type { SellerTool, SellerSkillConfig, ReadableContractLike } from "./types.js";

const ZERO_HASH = "0x" + "0".repeat(64);
const TASK_STATUS_NAMES = [
  "INTENT_CREATED",
  "COMMITMENT_SUBMITTED",
  "FUNDED",
  "PROOF_SUBMITTED",
  "SETTLED",
  "REFUNDED"
] as const;

export function createSellerTools(config: SellerSkillConfig): SellerTool[] {
  const { agent, contract, verifier } = config;
  return [
    acceptTaskTool(agent, contract, verifier),
    executeTaskTool(agent),
    submitProofTool(agent, contract),
    checkSettlementTool(contract)
  ];
}

function acceptTaskTool(agent: SellerAgent, contract: ReadableContractLike, verifier: string): SellerTool {
  return {
    name: "fulfillpay_accept_task",
    description:
      "Accept a FulfillPay task as a seller: build the execution commitment, upload it to storage, and submit it on-chain. " +
      "Call this after the buyer shares a taskId and you have agreed to perform the task. " +
      "The commitment declares which API endpoint, allowed models, and minimum token delivery you commit to. " +
      "Once submitted, the buyer will validate and fund the task.",
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
      const i = input as {
        taskId: string;
        host: string;
        path: string;
        method: string;
        allowedModels: string[];
        minTotalTokens: number;
        deadline: string;
      };

      const rawTask = await contract.getTask(normalizeBytes32(i.taskId, "taskId"));
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
        commitment
      };
    }
  };
}

function executeTaskTool(agent: SellerAgent): SellerTool {
  return {
    name: "fulfillpay_execute_task",
    description:
      "Execute a funded FulfillPay task via a zkTLS-proven API call. " +
      "Performs the AI inference request with cryptographic proof, then uploads the proof and delivery receipt to storage. " +
      "Returns the receipt object needed for fulfillpay_submit_proof. " +
      "Call this once per API call declared in your commitment — the task must be in FUNDED status.",
    inputSchema: {
      type: "object",
      required: ["commitment", "taskNonce", "callIndex", "request", "declaredModel"],
      properties: {
        commitment: {
          type: "object",
          description: "The ExecutionCommitment you submitted (returned by fulfillpay_accept_task)"
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
          description: "The API request to execute — host/path/method must match your commitment target",
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
          description: "The AI model name to use — must be in commitment.allowedModels"
        },
        providerOptions: {
          type: "object",
          description: "Optional zkTLS provider-specific parameters (e.g. Reclaim session options)"
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      const i = input as {
        commitment: ExecutionCommitment;
        taskNonce: string;
        callIndex: number;
        request: {
          host: string;
          path: string;
          method: string;
          headers?: Record<string, string>;
          body?: unknown;
        };
        declaredModel: string;
        providerOptions?: Record<string, unknown>;
      };

      const result = await agent.provenFetch({
        commitment: i.commitment,
        taskNonce: normalizeBytes32(i.taskNonce, "taskNonce"),
        callIndex: i.callIndex,
        request: i.request,
        declaredModel: i.declaredModel,
        ...(i.providerOptions ? { providerOptions: i.providerOptions } : {})
      });

      return {
        receipt: result.receipt,
        receiptURI: result.receiptPointer.uri,
        receiptHash: result.receiptPointer.hash,
        rawProofURI: result.rawProofPointer.uri,
        rawProofHash: result.rawProofPointer.hash
      };
    }
  };
}

function submitProofTool(agent: SellerAgent, contract: ReadableContractLike): SellerTool {
  return {
    name: "fulfillpay_submit_proof",
    description:
      "Assemble all delivery receipts into a proof bundle, upload it to storage, and submit the proof bundle hash on-chain. " +
      "Call this after all fulfillpay_execute_task calls are complete to claim payment. " +
      "Transitions the task to PROOF_SUBMITTED — the verifier then settles and releases payment to the seller.",
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
          description: "Array of receipt objects returned by fulfillpay_execute_task — one per API call",
          items: { type: "object" },
          minItems: 1
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      const i = input as { commitment: ExecutionCommitment; receipts: DeliveryReceipt[] };
      const bundle = agent.buildProofBundle({ commitment: i.commitment, receipts: i.receipts });
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
        proofBundleURI: result.proofBundleURI
      };
    }
  };
}

function checkSettlementTool(contract: ReadableContractLike): SellerTool {
  return {
    name: "fulfillpay_check_settlement",
    description:
      "Check whether a FulfillPay task has been settled and payment released to the seller. " +
      "Call this after fulfillpay_submit_proof to track when the verifier settles the task. " +
      "Returns settlement timestamp, report hash, and current task status.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "The task ID to check settlement for (bytes32 hex)" }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      const i = input as { taskId: string };
      const task = await contract.getTask(normalizeBytes32(i.taskId, "taskId"));
      const statusCode = Number(task.status);
      const status = TASK_STATUS_NAMES[statusCode] ?? "UNKNOWN";

      return {
        taskId: i.taskId,
        status,
        settled: status === "SETTLED",
        refunded: status === "REFUNDED",
        proofSubmittedAt: task.proofSubmittedAtMs > 0n ? task.proofSubmittedAtMs.toString() : null,
        proofBundleHash: task.proofBundleHash !== ZERO_HASH ? task.proofBundleHash : null,
        proofBundleURI: task.proofBundleURI || null,
        settledAt: task.settledAtMs > 0n ? task.settledAtMs.toString() : null,
        refundedAt: task.refundedAtMs > 0n ? task.refundedAtMs.toString() : null,
        reportHash: task.reportHash !== ZERO_HASH ? task.reportHash : null
      };
    }
  };
}
