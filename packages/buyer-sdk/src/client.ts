import { Contract, ZeroHash, type TransactionReceipt } from "ethers";

import {
  assertExecutionCommitment,
  assertVerificationReport,
  hashExecutionCommitment,
  hashVerificationReport,
  normalizeAddress,
  normalizeBytes32,
  normalizeUIntString,
  SCHEMA_VERSIONS,
  type Address,
  type Bytes32,
  type ExecutionCommitment,
  type TaskIntent,
  type TaskStatus,
  type UIntLike,
  type UIntString,
  type VerificationReport
} from "@tyrpay/sdk-core";

import { TyrPaySettlementAbi } from "./abi.js";
import {
  BuyerSdkConfigurationError,
  BuyerSdkValidationError,
  type BuyerReportRecord,
  type BuyerSdkConfig,
  type BuyerTask,
  type CommitmentExpectations,
  type CommitmentRecord,
  type ContractTiming,
  type CreateTaskIntentInput,
  type CreatedTaskIntent,
  type FundTaskOptions,
  type ValidatedCommitment
} from "./types.js";

const TASK_STATUSES = [
  "INTENT_CREATED",
  "COMMITMENT_SUBMITTED",
  "FUNDED",
  "PROOF_SUBMITTED",
  "SETTLED",
  "REFUNDED"
] as const satisfies readonly TaskStatus[];

type ContractTask = {
  taskId: string;
  taskNonce: string;
  buyer: string;
  seller: string;
  token: string;
  amount: bigint;
  deadlineMs: bigint;
  commitmentHash: string;
  commitmentURI: string;
  fundedAtMs: bigint;
  proofBundleHash: string;
  proofBundleURI: string;
  proofSubmittedAtMs: bigint;
  reportHash: string;
  settledAtMs: bigint;
  refundedAtMs: bigint;
  status: bigint | number;
};

export class BuyerSdk {
  private readonly settlementAddress: Address;
  private readonly contract: Contract;

  constructor(private readonly config: BuyerSdkConfig) {
    this.settlementAddress = normalizeAddress(config.settlementAddress, "settlementAddress");

    if (!config.signer.provider) {
      throw new BuyerSdkConfigurationError("BuyerSdk signer must be connected to a provider.");
    }

    this.contract = new Contract(this.settlementAddress, TyrPaySettlementAbi, config.signer);
  }

  async createTaskIntent(input: CreateTaskIntentInput): Promise<CreatedTaskIntent> {
    const buyer = await this.getSignerAddress();
    const taskIntent = buildTaskIntent({
      buyer,
      seller: input.seller,
      token: input.token,
      amount: input.amount,
      deadline: input.deadline,
      metadataHash: input.metadataHash,
      metadataURI: input.metadataURI
    });
    const args = toCreateTaskIntentArgs(taskIntent);
    const tx = await this.contract.createTaskIntent(...args);
    const receipt = await waitForReceipt(tx);
    const { taskId, taskNonce } = parseTaskIntentCreatedReceipt(receipt, this.contract, this.settlementAddress, taskIntent);

    return {
      taskId,
      taskNonce,
      taskIntent,
      receipt
    };
  }

  async getTask(taskId: string): Promise<BuyerTask> {
    const task = (await this.contract.getTask(normalizeBytes32(taskId, "taskId"))) as ContractTask;
    return normalizeTask(task);
  }

  async getCommitment(taskId: string): Promise<CommitmentRecord> {
    const storage = this.requireStorage();
    const task = await this.getTask(taskId);

    if (!task.commitmentHash || !task.commitmentURI) {
      throw new BuyerSdkValidationError(`Task ${task.taskId} does not have a submitted commitment.`);
    }

    const commitment = await storage.getObject<ExecutionCommitment>(
      {
        uri: task.commitmentURI,
        hash: task.commitmentHash
      },
      {
        expectedHash: task.commitmentHash
      }
    );

    assertExecutionCommitment(commitment);

    return {
      task,
      commitmentHash: task.commitmentHash,
      commitmentURI: task.commitmentURI,
      commitment
    };
  }

  async validateCommitment(taskId: string, expectations: CommitmentExpectations = {}): Promise<ValidatedCommitment> {
    const record = await this.getCommitment(taskId);

    if (hashExecutionCommitment(record.commitment) !== record.commitmentHash) {
      throw new BuyerSdkValidationError(`Commitment hash mismatch for task ${record.task.taskId}.`);
    }

    if (record.commitment.taskId !== record.task.taskId) {
      throw new BuyerSdkValidationError(`Commitment taskId does not match task ${record.task.taskId}.`);
    }
    if (record.commitment.buyer !== record.task.buyer) {
      throw new BuyerSdkValidationError(`Commitment buyer does not match task ${record.task.taskId}.`);
    }
    if (record.commitment.seller !== record.task.seller) {
      throw new BuyerSdkValidationError(`Commitment seller does not match task ${record.task.taskId}.`);
    }

    const commitmentDeadline = BigInt(record.commitment.deadline);
    const taskDeadline = BigInt(record.task.deadline);

    if (commitmentDeadline > taskDeadline) {
      throw new BuyerSdkValidationError(`Commitment deadline exceeds task deadline for task ${record.task.taskId}.`);
    }
    if (record.commitment.allowedModels.length === 0) {
      throw new BuyerSdkValidationError(`Commitment allowedModels must not be empty for task ${record.task.taskId}.`);
    }

    const requireNonZeroMinUsage = expectations.requireNonZeroMinUsage ?? false;

    if (requireNonZeroMinUsage && record.commitment.minUsage.totalTokens <= 0) {
      throw new BuyerSdkValidationError(`Commitment minUsage.totalTokens must be greater than zero for task ${record.task.taskId}.`);
    }

    if (expectations.minTotalTokens !== undefined && record.commitment.minUsage.totalTokens < expectations.minTotalTokens) {
      throw new BuyerSdkValidationError(`Commitment minUsage.totalTokens is below the buyer requirement for task ${record.task.taskId}.`);
    }

    enforceMembershipExpectation(
      expectations.acceptedHosts,
      record.commitment.target.host,
      "Commitment target host is not accepted by the buyer."
    );
    enforceMembershipExpectation(
      expectations.acceptedPaths,
      record.commitment.target.path,
      "Commitment target path is not accepted by the buyer."
    );
    enforceMembershipExpectation(
      expectations.acceptedMethods?.map((value) => value.toUpperCase()),
      record.commitment.target.method,
      "Commitment target method is not accepted by the buyer."
    );

    if (expectations.acceptedModels && expectations.acceptedModels.length > 0) {
      const acceptedModels = new Set(expectations.acceptedModels);

      for (const model of record.commitment.allowedModels) {
        if (!acceptedModels.has(model)) {
          throw new BuyerSdkValidationError(`Commitment model ${model} is not accepted by the buyer.`);
        }
      }
    }

    if (expectations.expectedVerifier) {
      const expectedVerifier = normalizeAddress(expectations.expectedVerifier, "expectedVerifier");

      if (record.commitment.verifier !== expectedVerifier) {
        throw new BuyerSdkValidationError(`Commitment verifier does not match the buyer expectation for task ${record.task.taskId}.`);
      }
    }

    if (expectations.nowMs !== undefined && commitmentDeadline < BigInt(normalizeUIntString(expectations.nowMs, "nowMs"))) {
      throw new BuyerSdkValidationError(`Commitment is already expired for task ${record.task.taskId}.`);
    }

    return {
      ...record,
      expectationsApplied: {
        ...expectations,
        requireNonZeroMinUsage
      }
    };
  }

  async fundTask(taskId: string, options: FundTaskOptions = {}): Promise<TransactionReceipt> {
    const normalizedTaskId = normalizeBytes32(taskId, "taskId");
    if (!options.skipValidation) {
      await this.validateCommitment(normalizedTaskId, options.validateCommitment ?? {});
    }

    const tx = await this.contract.fundTask(normalizedTaskId);
    return waitForReceipt(tx);
  }

  async refundAfterProofSubmissionDeadline(taskId: string): Promise<TransactionReceipt> {
    const tx = await this.contract.refundAfterProofSubmissionDeadline(normalizeBytes32(taskId, "taskId"));
    return waitForReceipt(tx);
  }

  async refundAfterVerificationTimeout(taskId: string): Promise<TransactionReceipt> {
    const tx = await this.contract.refundAfterVerificationTimeout(normalizeBytes32(taskId, "taskId"));
    return waitForReceipt(tx);
  }

  async getTaskStatus(taskId: string): Promise<import("@tyrpay/sdk-core").DerivedTaskStatus> {
    const task = await this.getTask(taskId);

    if ((task.status === "INTENT_CREATED" || task.status === "COMMITMENT_SUBMITTED") && (await this.hasDeadlinePassed(task.deadline))) {
      return "EXPIRED";
    }

    if (task.status === "FUNDED") {
      return "EXECUTING";
    }

    if (task.status === "PROOF_SUBMITTED" && task.reportHash && this.config.reportResolver) {
      const reportRecord = await this.getReport(task.taskId);

      if (reportRecord.report) {
        return reportRecord.report.passed ? "VERIFIED_PASS" : "VERIFIED_FAIL";
      }
    }

    return task.status;
  }

  async getReport(taskId: string): Promise<BuyerReportRecord> {
    const task = await this.getTask(taskId);

    if (!task.reportHash || !this.config.reportResolver) {
      return {
        task,
        reportHash: task.reportHash,
        report: null
      };
    }

    const report = await this.config.reportResolver.getReport({
      task,
      taskId: task.taskId,
      reportHash: task.reportHash
    });

    if (!report) {
      return {
        task,
        reportHash: task.reportHash,
        report: null
      };
    }

    assertVerificationReport(report);
    const computedReportHash = hashVerificationReport(report);

    if (computedReportHash !== task.reportHash) {
      throw new BuyerSdkValidationError(`Resolved report hash does not match the on-chain report hash for task ${task.taskId}.`);
    }

    if (report.reportHash && report.reportHash !== task.reportHash) {
      throw new BuyerSdkValidationError(`Resolved report.reportHash does not match the on-chain report hash for task ${task.taskId}.`);
    }

    return {
      task,
      reportHash: task.reportHash,
      report
    };
  }

  async getTiming(): Promise<ContractTiming> {
    const [currentTimeMs, proofSubmissionGracePeriodMs, verificationTimeoutMs] = await Promise.all([
      this.contract.currentTimeMs() as Promise<bigint>,
      this.contract.proofSubmissionGracePeriodMs() as Promise<bigint>,
      this.contract.verificationTimeoutMs() as Promise<bigint>
    ]);

    return {
      currentTimeMs: currentTimeMs.toString(),
      proofSubmissionGracePeriodMs: proofSubmissionGracePeriodMs.toString(),
      verificationTimeoutMs: verificationTimeoutMs.toString()
    };
  }

  async ready(): Promise<import("./types.js").BuyerSdkReadyStatus> {
    const signerAddress = await this.getSignerAddress();
    const network = await this.config.signer.provider?.getNetwork();

    if (!network) {
      throw new BuyerSdkConfigurationError("BuyerSdk signer must be connected to a provider.");
    }

    return {
      signerAddress,
      chainId: normalizeUIntString(network.chainId, "chainId"),
      settlementAddress: this.settlementAddress
    };
  }

  private async getSignerAddress(): Promise<Address> {
    return normalizeAddress(await this.config.signer.getAddress(), "buyer");
  }

  private requireStorage() {
    if (!this.config.storage) {
      throw new BuyerSdkConfigurationError("BuyerSdk requires a storage adapter for commitment reads.");
    }

    return this.config.storage;
  }

  private async hasDeadlinePassed(deadlineMs: UIntString): Promise<boolean> {
    const currentTimeMs = (await this.contract.currentTimeMs()) as bigint;
    return currentTimeMs > BigInt(deadlineMs);
  }
}

function buildTaskIntent(input: {
  buyer: string;
  seller: string;
  token: string;
  amount: UIntLike;
  deadline: UIntLike;
  metadataHash?: string;
  metadataURI?: string;
}): TaskIntent {
  return {
    schemaVersion: SCHEMA_VERSIONS.taskIntent,
    buyer: normalizeAddress(input.buyer, "buyer"),
    seller: normalizeAddress(input.seller, "seller"),
    token: normalizeAddress(input.token, "token"),
    amount: normalizeUIntString(input.amount, "amount"),
    deadline: normalizeUIntString(input.deadline, "deadline"),
    ...(input.metadataHash ? { metadataHash: normalizeBytes32(input.metadataHash, "metadataHash") } : {}),
    ...(input.metadataURI ? { metadataURI: input.metadataURI } : {})
  };
}

function toCreateTaskIntentArgs(taskIntent: TaskIntent): [Address, Address, bigint, bigint, Bytes32, string] {
  return [
    taskIntent.seller,
    taskIntent.token,
    BigInt(taskIntent.amount),
    BigInt(taskIntent.deadline),
    taskIntent.metadataHash ?? (ZeroHash as Bytes32),
    taskIntent.metadataURI ?? ""
  ];
}

function normalizeTask(task: ContractTask): BuyerTask {
  const statusCode = Number(task.status);
  const status = TASK_STATUSES[statusCode];

  if (status === undefined) {
    throw new BuyerSdkValidationError(`Unsupported on-chain task status code: ${statusCode}.`);
  }

  return {
    taskId: normalizeBytes32(task.taskId, "taskId"),
    taskNonce: normalizeBytes32(task.taskNonce, "taskNonce"),
    buyer: normalizeAddress(task.buyer, "buyer"),
    seller: normalizeAddress(task.seller, "seller"),
    token: normalizeAddress(task.token, "token"),
    amount: task.amount.toString(),
    deadline: task.deadlineMs.toString(),
    commitmentHash: toNullableBytes32(task.commitmentHash),
    commitmentURI: toNullableString(task.commitmentURI),
    fundedAt: toNullableUIntString(task.fundedAtMs),
    proofBundleHash: toNullableBytes32(task.proofBundleHash),
    proofBundleURI: toNullableString(task.proofBundleURI),
    proofSubmittedAt: toNullableUIntString(task.proofSubmittedAtMs),
    reportHash: toNullableBytes32(task.reportHash),
    settledAt: toNullableUIntString(task.settledAtMs),
    refundedAt: toNullableUIntString(task.refundedAtMs),
    status,
    statusCode
  };
}

function toNullableBytes32(value: string): Bytes32 | null {
  return value === ZeroHash ? null : normalizeBytes32(value, "bytes32");
}

function toNullableString(value: string): string | null {
  return value.length === 0 ? null : value;
}

function toNullableUIntString(value: bigint): UIntString | null {
  return value === 0n ? null : value.toString();
}

function enforceMembershipExpectation(acceptedValues: string[] | undefined, actualValue: string, message: string): void {
  if (!acceptedValues || acceptedValues.length === 0) {
    return;
  }

  if (!acceptedValues.includes(actualValue)) {
    throw new BuyerSdkValidationError(message);
  }
}

async function waitForReceipt(tx: { wait(): Promise<TransactionReceipt | null> }): Promise<TransactionReceipt> {
  const receipt = await tx.wait();

  if (!receipt) {
    throw new BuyerSdkValidationError("Transaction did not produce a receipt.");
  }

  return receipt;
}

function parseTaskIntentCreatedReceipt(
  receipt: TransactionReceipt,
  contract: Contract,
  settlementAddress: Address,
  taskIntent: TaskIntent
): { taskId: Bytes32; taskNonce: Bytes32 } {
  for (const log of receipt.logs) {
    if (normalizeAddress(log.address, "log.address") !== settlementAddress) {
      continue;
    }

    let parsedLog: ReturnType<Contract["interface"]["parseLog"]>;

    try {
      parsedLog = contract.interface.parseLog({
        topics: log.topics,
        data: log.data
      });
    } catch {
      continue;
    }

    if (!parsedLog || parsedLog.name !== "TaskIntentCreated") {
      continue;
    }

    const taskId = normalizeBytes32(parsedLog.args.taskId, "taskId");
    const taskNonce = normalizeBytes32(parsedLog.args.taskNonce, "taskNonce");
    const buyer = normalizeAddress(parsedLog.args.buyer, "buyer");
    const seller = normalizeAddress(parsedLog.args.seller, "seller");
    const token = normalizeAddress(parsedLog.args.token, "token");
    const amount = normalizeUIntString(parsedLog.args.amount, "amount");
    const deadline = normalizeUIntString(parsedLog.args.deadlineMs, "deadlineMs");

    if (buyer !== taskIntent.buyer) {
      throw new BuyerSdkValidationError("TaskIntentCreated buyer does not match the submitted task intent.");
    }
    if (seller !== taskIntent.seller) {
      throw new BuyerSdkValidationError("TaskIntentCreated seller does not match the submitted task intent.");
    }
    if (token !== taskIntent.token) {
      throw new BuyerSdkValidationError("TaskIntentCreated token does not match the submitted task intent.");
    }
    if (amount !== taskIntent.amount) {
      throw new BuyerSdkValidationError("TaskIntentCreated amount does not match the submitted task intent.");
    }
    if (deadline !== taskIntent.deadline) {
      throw new BuyerSdkValidationError("TaskIntentCreated deadline does not match the submitted task intent.");
    }

    return {
      taskId,
      taskNonce
    };
  }

  throw new BuyerSdkValidationError("TaskIntentCreated event was not found in the transaction receipt.");
}
