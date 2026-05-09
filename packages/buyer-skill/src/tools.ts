import type { BuyerSdk, CommitmentExpectations } from "@fulfillpay/buyer-sdk";
import type { BuyerTool } from "./types.js";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 600_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBuyerTools(sdk: BuyerSdk): BuyerTool[] {
  return [
    postTaskTool(sdk),
    checkTaskTool(sdk),
    refundTaskTool(sdk),
    listTasksTool(sdk)
  ];
}

function postTaskTool(sdk: BuyerSdk): BuyerTool {
  return {
    name: "fulfillpay_post_task",
    description:
      "Post a FulfillPay task and complete the full buyer flow automatically: " +
      "create the task on-chain, wait for the seller to submit their commitment, validate it, then fund the task. " +
      "This is the primary buyer tool — call it once with business parameters; it handles all on-chain steps internally. " +
      "Returns the taskId and funding confirmation when the task is ready for the seller to execute.",
    inputSchema: {
      type: "object",
      required: ["seller", "token", "amount", "deadline"],
      properties: {
        seller: { type: "string", description: "Ethereum address of the seller" },
        token: { type: "string", description: "ERC-20 token contract address for payment" },
        amount: { type: "string", description: "Payment amount in token base units (e.g. '1000000' for 1 USDC)" },
        deadline: { type: "string", description: "Task deadline as Unix milliseconds timestamp string" },
        metadataHash: { type: "string", description: "Optional bytes32 hash of task metadata" },
        metadataURI: { type: "string", description: "Optional URI pointing to task metadata" },
        expectations: {
          type: "object",
          description: "Optional commitment validation constraints — if the seller's commitment violates any, the tool throws",
          properties: {
            acceptedHosts: { type: "array", items: { type: "string" }, description: "Allowed API hosts" },
            acceptedPaths: { type: "array", items: { type: "string" }, description: "Allowed API paths" },
            acceptedMethods: { type: "array", items: { type: "string" }, description: "Allowed HTTP methods" },
            acceptedModels: { type: "array", items: { type: "string" }, description: "Allowed AI model names" },
            expectedVerifier: { type: "string", description: "Required verifier address" },
            minTotalTokens: { type: "number", description: "Minimum required minUsage.totalTokens" },
            requireNonZeroMinUsage: { type: "boolean" }
          },
          additionalProperties: false
        },
        pollIntervalMs: {
          type: "number",
          description: `Polling interval while waiting for seller commitment in ms (default ${DEFAULT_POLL_INTERVAL_MS})`
        },
        timeoutMs: {
          type: "number",
          description: `Max ms to wait for seller commitment before giving up (default ${DEFAULT_TIMEOUT_MS})`
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      const i = input as {
        seller: string;
        token: string;
        amount: string;
        deadline: string;
        metadataHash?: string;
        metadataURI?: string;
        expectations?: CommitmentExpectations;
        pollIntervalMs?: number;
        timeoutMs?: number;
      };

      const created = await sdk.createTaskIntent({
        seller: i.seller,
        token: i.token,
        amount: i.amount,
        deadline: i.deadline,
        ...(i.metadataHash ? { metadataHash: i.metadataHash } : {}),
        ...(i.metadataURI ? { metadataURI: i.metadataURI } : {})
      });
      const { taskId, taskNonce } = created;

      const pollInterval = i.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      const totalTimeout = i.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const deadline = Date.now() + totalTimeout;

      while (true) {
        const task = await sdk.getTask(taskId);
        if (task.commitmentHash) break;

        const remaining = deadline - Date.now();
        if (remaining <= pollInterval) {
          throw new Error(
            `Timed out after ${totalTimeout}ms waiting for seller commitment on task ${taskId}. ` +
            "Call fulfillpay_check_task to monitor status."
          );
        }
        await sleep(pollInterval);
      }

      const validated = await sdk.validateCommitment(taskId, i.expectations);
      const fundReceipt = await sdk.fundTask(taskId, { validateCommitment: i.expectations });

      return {
        taskId,
        taskNonce,
        createTxHash: created.receipt.hash,
        fundTxHash: fundReceipt.hash,
        commitmentHash: validated.commitmentHash,
        commitmentURI: validated.commitmentURI
      };
    }
  };
}

function checkTaskTool(sdk: BuyerSdk): BuyerTool {
  return {
    name: "fulfillpay_check_task",
    description:
      "Check the current status and details of a FulfillPay task. " +
      "Status progresses: INTENT_CREATED → COMMITMENT_SUBMITTED → FUNDED → PROOF_SUBMITTED → SETTLED (or REFUNDED). " +
      "derivedStatus adds EXPIRED (deadline passed without funding) and EXECUTING (funded, seller running).",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "The bytes32 task ID" }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      const i = input as { taskId: string };
      const [task, derivedStatus] = await Promise.all([
        sdk.getTask(i.taskId),
        sdk.getTaskStatus(i.taskId)
      ]);
      return { ...task, derivedStatus };
    }
  };
}

function refundTaskTool(sdk: BuyerSdk): BuyerTool {
  return {
    name: "fulfillpay_refund_task",
    description:
      "Request a refund for a funded FulfillPay task after the seller or verifier missed a deadline. " +
      "Use reason='proof_submission_deadline' if the seller never submitted proof within the grace period. " +
      "Use reason='verification_timeout' if the verifier never settled within the verification timeout.",
    inputSchema: {
      type: "object",
      required: ["taskId", "reason"],
      properties: {
        taskId: { type: "string", description: "The task ID to refund" },
        reason: {
          type: "string",
          enum: ["proof_submission_deadline", "verification_timeout"],
          description:
            "'proof_submission_deadline' — seller missed proof grace period; " +
            "'verification_timeout' — verifier missed settlement timeout"
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      const i = input as { taskId: string; reason: "proof_submission_deadline" | "verification_timeout" };
      const receipt =
        i.reason === "proof_submission_deadline"
          ? await sdk.refundAfterProofSubmissionDeadline(i.taskId)
          : await sdk.refundAfterVerificationTimeout(i.taskId);
      return { txHash: receipt.hash };
    }
  };
}

function listTasksTool(sdk: BuyerSdk): BuyerTool {
  return {
    name: "fulfillpay_list_tasks",
    description:
      "Check the status of multiple FulfillPay task IDs in a single call. " +
      "Use this to monitor all active tasks at once instead of calling fulfillpay_check_task one by one. " +
      "Results are returned in the same order as the input taskIds.",
    inputSchema: {
      type: "object",
      required: ["taskIds"],
      properties: {
        taskIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of bytes32 task IDs to check (max 20)",
          minItems: 1,
          maxItems: 20
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      const i = input as { taskIds: string[] };
      return Promise.all(
        i.taskIds.map(async (taskId) => {
          const [task, derivedStatus] = await Promise.all([
            sdk.getTask(taskId),
            sdk.getTaskStatus(taskId)
          ]);
          return { ...task, derivedStatus };
        })
      );
    }
  };
}
