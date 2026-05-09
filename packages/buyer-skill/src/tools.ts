import type { BuyerSdk, CommitmentExpectations } from "@tyrpay/buyer-sdk";
import type { BuyerTool } from "./types.js";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 600_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapBuyerUserStatus(task: { status?: string }, derivedStatus: string) {
  if (derivedStatus === "EXPIRED") {
    return {
      userStatus: "EXPIRED",
      userMessage: "The task expired before funding. No payment was locked."
    };
  }

  if (task.status === "SETTLED") {
    return {
      userStatus: "COMPLETED",
      userMessage: "The task was verified and payment was released to the seller."
    };
  }

  if (task.status === "REFUNDED") {
    return {
      userStatus: "REFUNDED",
      userMessage: "The task ended with a refund to the buyer."
    };
  }

  if (task.status === "PROOF_SUBMITTED") {
    return {
      userStatus: "AWAITING_VERIFICATION",
      userMessage: "The seller submitted proof. Verification is still pending."
    };
  }

  if (derivedStatus === "EXECUTING" || task.status === "FUNDED") {
    return {
      userStatus: "IN_PROGRESS",
      userMessage: "Payment is locked and the seller is executing the task."
    };
  }

  if (task.status === "COMMITMENT_SUBMITTED") {
    return {
      userStatus: "READY_TO_FUND",
      userMessage: "The seller responded with execution terms. Review and fund if acceptable."
    };
  }

  return {
    userStatus: "WAITING_FOR_SELLER",
    userMessage: "The task was created and is waiting for the seller to respond."
  };
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
    name: "tyrpay_post_task",
    description:
      "Post a TyrPay task and complete the buyer setup flow automatically: " +
      "create the task, wait for the seller to respond with execution terms, validate those terms, then lock payment. " +
      "Use this when the buyer is ready to start a task and wants a funded task that the seller can execute. " +
      "Returns the taskId together with buyer-facing status fields when the task is ready for execution.",
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
          description:
            "Optional commitment validation constraints. If the seller responds with terms outside these constraints, the tool throws.",
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
          description: `Polling interval while waiting for the seller response in ms (default ${DEFAULT_POLL_INTERVAL_MS})`
        },
        timeoutMs: {
          type: "number",
          description: `Max ms to wait for the seller response before giving up (default ${DEFAULT_TIMEOUT_MS})`
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
      const waitDeadline = Date.now() + totalTimeout;

      while (true) {
        const task = await sdk.getTask(taskId);
        if (task.commitmentHash) break;

        const remaining = waitDeadline - Date.now();
        if (remaining <= pollInterval) {
          throw new Error(
            `Timed out after ${totalTimeout}ms waiting for the seller to respond on task ${taskId}. ` +
              "The task was created, but no payment was locked. Call tyrpay_check_task to monitor or decide whether to retry later."
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
        commitmentURI: validated.commitmentURI,
        userStatus: "IN_PROGRESS",
        userMessage: "Payment is locked and the seller can now execute the task."
      };
    }
  };
}

function checkTaskTool(sdk: BuyerSdk): BuyerTool {
  return {
    name: "tyrpay_check_task",
    description:
      "Check the current status and details of a TyrPay task. " +
      "Returns both the raw protocol status and buyer-facing status fields so an agent can explain progress without exposing protocol terms directly.",
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
      const [task, derivedStatus] = await Promise.all([sdk.getTask(i.taskId), sdk.getTaskStatus(i.taskId)]);
      return { ...task, derivedStatus, ...mapBuyerUserStatus(task, derivedStatus) };
    }
  };
}

function refundTaskTool(sdk: BuyerSdk): BuyerTool {
  return {
    name: "tyrpay_refund_task",
    description:
      "Request a refund for a funded TyrPay task after the workflow stalled. " +
      "Use reason='proof_submission_deadline' when the seller did not submit proof in time. " +
      "Use reason='verification_timeout' when proof was submitted but final verification did not finish in time.",
    inputSchema: {
      type: "object",
      required: ["taskId", "reason"],
      properties: {
        taskId: { type: "string", description: "The task ID to refund" },
        reason: {
          type: "string",
          enum: ["proof_submission_deadline", "verification_timeout"],
          description:
            "'proof_submission_deadline' = seller did not submit proof before the proof deadline; " +
            "'verification_timeout' = proof was submitted but final verification did not finish before timeout"
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
      return {
        txHash: receipt.hash,
        userStatus: "REFUND_IN_PROGRESS",
        userMessage: "A refund transaction was sent. Check the task again to confirm that funds returned to the buyer."
      };
    }
  };
}

function listTasksTool(sdk: BuyerSdk): BuyerTool {
  return {
    name: "tyrpay_list_tasks",
    description:
      "Check the status of multiple TyrPay task IDs in a single call. " +
      "Use this to monitor all active tasks at once instead of calling tyrpay_check_task one by one. " +
      "Each result includes both the raw protocol status and buyer-facing status fields.",
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
          const [task, derivedStatus] = await Promise.all([sdk.getTask(taskId), sdk.getTaskStatus(taskId)]);
          return { ...task, derivedStatus, ...mapBuyerUserStatus(task, derivedStatus) };
        })
      );
    }
  };
}
