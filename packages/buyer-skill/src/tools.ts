import type { BuyerSdk } from "@tyrpay/buyer-sdk";
import { BuyerSkillToolError, wrapBuyerSkillError } from "./errors.js";
import type {
  BuyerStatusView,
  BuyerTaskStatusResult,
  BuyerTool,
  CheckTaskInput,
  FundTaskInput,
  FundTaskResult,
  ListTasksInput,
  ListTasksResult,
  PostTaskInput,
  PostTaskResult,
  ReadyResult,
  RefundTaskInput,
  RefundTaskResult
} from "./types.js";
import {
  validateCheckTaskInput,
  validateFundTaskInput,
  validateListTasksInput,
  validatePostTaskInput,
  validateRefundTaskInput
} from "./validation.js";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 600_000;
const MAX_LIST_TASKS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapBuyerUserStatus(task: { status?: string }, derivedStatus: string): BuyerStatusView {
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
    fundTaskTool(sdk),
    checkTaskTool(sdk),
    refundTaskTool(sdk),
    listTasksTool(sdk),
    readyTool(sdk)
  ];
}

function postTaskTool(sdk: BuyerSdk): BuyerTool<PostTaskResult> {
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
      try {
        const i = validatePostTaskInput(input);
        return await executePostTask(sdk, i);
      } catch (error) {
        throw wrapBuyerSkillError(error);
      }
    }
  };
}

async function executePostTask(sdk: BuyerSdk, input: PostTaskInput): Promise<PostTaskResult> {
  const created = await sdk.createTaskIntent({
    seller: input.seller,
    token: input.token,
    amount: input.amount,
    deadline: input.deadline,
    ...(input.metadataHash ? { metadataHash: input.metadataHash } : {}),
    ...(input.metadataURI ? { metadataURI: input.metadataURI } : {})
  });
  const { taskId, taskNonce } = created;

  if (input.createOnly) {
    return {
      taskId,
      taskNonce,
      createTxHash: created.receipt.hash,
      userStatus: "WAITING_FOR_SELLER",
      userMessage: "The task was created. Wait for the seller response, then call tyrpay_fund_task when you are ready to lock payment."
    };
  }

  const pollInterval = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const totalTimeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const waitDeadline = Date.now() + totalTimeout;

  while (true) {
    const task = await sdk.getTask(taskId);
    if (task.commitmentHash && task.commitmentURI) {
      const fundResult = await executeFundTask(sdk, {
        taskId,
        ...(input.expectations ? { expectations: input.expectations } : {})
      });
      return {
        taskId,
        taskNonce,
        createTxHash: created.receipt.hash,
        fundTxHash: fundResult.fundTxHash,
        commitmentHash: fundResult.commitmentHash,
        commitmentURI: fundResult.commitmentURI,
        userStatus: fundResult.userStatus,
        userMessage: fundResult.userMessage
      };
    }

    if (Date.now() >= waitDeadline) {
      return {
        taskId,
        taskNonce,
        createTxHash: created.receipt.hash,
        commitmentHash: task.commitmentHash,
        commitmentURI: task.commitmentURI,
        timedOut: true,
        userStatus: "WAITING_FOR_SELLER",
        userMessage: "The task was created, but the seller did not respond before the wait window ended. Use tyrpay_check_task to monitor it or tyrpay_fund_task once the commitment appears."
      };
    }

    await sleep(withJitter(pollInterval));
  }
}

function fundTaskTool(sdk: BuyerSdk): BuyerTool<FundTaskResult> {
  return {
    name: "tyrpay_fund_task",
    description:
      "Fund a TyrPay task after the seller has submitted a commitment. " +
      "Use this when you created a task with createOnly=true, when tyrpay_post_task timed out, or when you want funding to be a separate explicit step.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "The bytes32 task ID to fund" },
        expectations: {
          type: "object",
          description: "Optional commitment validation constraints to enforce before payment is locked.",
          properties: {
            acceptedHosts: { type: "array", items: { type: "string" }, description: "Allowed API hosts" },
            acceptedPaths: { type: "array", items: { type: "string" }, description: "Allowed API paths" },
            acceptedMethods: { type: "array", items: { type: "string" }, description: "Allowed HTTP methods" },
            acceptedModels: { type: "array", items: { type: "string" }, description: "Allowed AI model names" },
            expectedVerifier: { type: "string", description: "Required verifier address" },
            minTotalTokens: { type: "number", description: "Minimum required minUsage.totalTokens" },
            requireNonZeroMinUsage: { type: "boolean" },
            nowMs: { type: "string", description: "Optional current time as Unix milliseconds string for deadline enforcement" }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
    async execute(input: unknown) {
      try {
        const i = validateFundTaskInput(input);
        return await executeFundTask(sdk, i);
      } catch (error) {
        throw wrapBuyerSkillError(error);
      }
    }
  };
}

async function executeFundTask(sdk: BuyerSdk, input: FundTaskInput): Promise<FundTaskResult> {
  const validated = await sdk.validateCommitment(input.taskId, input.expectations);
  const fundReceipt = await sdk.fundTask(input.taskId, { validateCommitment: input.expectations });

  return {
    taskId: input.taskId,
    fundTxHash: fundReceipt.hash,
    commitmentHash: validated.commitmentHash,
    commitmentURI: validated.commitmentURI,
    userStatus: "IN_PROGRESS",
    userMessage: "Payment is locked and the seller can now execute the task."
  };
}

function checkTaskTool(sdk: BuyerSdk): BuyerTool<BuyerTaskStatusResult> {
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
      try {
        const i = validateCheckTaskInput(input);
        return await getBuyerTaskStatus(sdk, i);
      } catch (error) {
        throw wrapBuyerSkillError(error);
      }
    }
  };
}

async function getBuyerTaskStatus(sdk: BuyerSdk, input: CheckTaskInput): Promise<BuyerTaskStatusResult> {
  const [task, derivedStatus] = await Promise.all([sdk.getTask(input.taskId), sdk.getTaskStatus(input.taskId)]);
  return { ...task, derivedStatus, ...mapBuyerUserStatus(task, derivedStatus) };
}

function refundTaskTool(sdk: BuyerSdk): BuyerTool<RefundTaskResult> {
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
      try {
        const i = validateRefundTaskInput(input);
      const receipt =
        i.reason === "proof_submission_deadline"
          ? await sdk.refundAfterProofSubmissionDeadline(i.taskId)
          : await sdk.refundAfterVerificationTimeout(i.taskId);
      return {
        taskId: i.taskId,
        txHash: receipt.hash,
        userStatus: "REFUND_IN_PROGRESS",
        userMessage: "A refund transaction was sent. Check the task again to confirm that funds returned to the buyer."
      };
      } catch (error) {
        throw wrapBuyerSkillError(error);
      }
    }
  };
}

function listTasksTool(sdk: BuyerSdk): BuyerTool<ListTasksResult> {
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
      try {
        const i = validateListTasksInput(input);
        return await executeListTasks(sdk, i);
      } catch (error) {
        throw wrapBuyerSkillError(error);
      }
    }
  };
}

async function executeListTasks(sdk: BuyerSdk, input: ListTasksInput): Promise<ListTasksResult> {
  if (input.taskIds.length > MAX_LIST_TASKS) {
    throw new BuyerSkillToolError({
      code: "VALIDATION_ERROR",
      message: `Expected no more than ${MAX_LIST_TASKS} task IDs per call.`,
      field: "taskIds",
      received: input.taskIds.length,
      suggestion: "Split the request into smaller batches.",
      retryable: false
    });
  }

  const results: ListTasksResult = [];

  for (let index = 0; index < input.taskIds.length; index += 5) {
    const batch = input.taskIds.slice(index, index + 5);
    const batchResults = await Promise.all(batch.map((taskId) => getBuyerTaskStatus(sdk, { taskId })));
    results.push(...batchResults);
  }

  return results;
}

function readyTool(sdk: BuyerSdk): BuyerTool<ReadyResult> {
  return {
    name: "tyrpay_ready",
    description:
      "Run a lightweight readiness check for the configured TyrPay buyer SDK. " +
      "Use this before the first payment workflow to verify signer access and provider connectivity.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    async execute(input: unknown) {
      try {
        if (input !== undefined && (typeof input !== "object" || input === null || Object.keys(input as Record<string, unknown>).length > 0)) {
          throw new BuyerSkillToolError({
            code: "VALIDATION_ERROR",
            message: "tyrpay_ready does not accept arguments.",
            field: "input",
            received: input,
            suggestion: "Call the tool with an empty object.",
            retryable: false
          });
        }

        const signer = (sdk as unknown as { config: { signer: { getAddress(): Promise<string>; provider?: { getNetwork(): Promise<unknown> } } } }).config.signer;
        const signerAddress = await signer.getAddress();

        if (!signer.provider) {
          throw new BuyerSkillToolError({
            code: "CONFIGURATION_ERROR",
            message: "BuyerSdk signer is missing a provider.",
            suggestion: "Connect the signer to an RPC provider before using buyer tools.",
            retryable: false
          });
        }

        await signer.provider.getNetwork();

        return {
          ok: true,
          signerAddress,
          userStatus: "READY",
          userMessage: "BuyerSdk signer and provider are reachable."
        };
      } catch (error) {
        throw wrapBuyerSkillError(error);
      }
    }
  };
}

function withJitter(pollIntervalMs: number): number {
  return pollIntervalMs + Math.floor(Math.random() * 1_000);
}
