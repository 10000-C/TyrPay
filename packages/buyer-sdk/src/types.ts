import type { Signer, TransactionReceipt } from "ethers";

import type {
  Address,
  Bytes32,
  DerivedTaskStatus,
  ExecutionCommitment,
  TaskIntent,
  TaskStatus,
  UIntLike,
  UIntString,
  URI,
  UnixMillis,
  VerificationReport
} from "@fulfillpay/sdk-core";
import type { StorageAdapter } from "@fulfillpay/storage-adapter";

export interface CreateTaskIntentInput {
  seller: string;
  token: string;
  amount: UIntLike;
  deadline: UIntLike;
  metadataHash?: string;
  metadataURI?: URI;
}

export interface CreatedTaskIntent {
  taskId: Bytes32;
  taskNonce: Bytes32;
  taskIntent: TaskIntent;
  receipt: TransactionReceipt;
}

export interface BuyerTask {
  taskId: Bytes32;
  taskNonce: Bytes32;
  buyer: Address;
  seller: Address;
  token: Address;
  amount: UIntString;
  deadline: UnixMillis;
  commitmentHash: Bytes32 | null;
  commitmentURI: URI | null;
  fundedAt: UnixMillis | null;
  proofBundleHash: Bytes32 | null;
  proofBundleURI: URI | null;
  proofSubmittedAt: UnixMillis | null;
  reportHash: Bytes32 | null;
  settledAt: UnixMillis | null;
  refundedAt: UnixMillis | null;
  status: TaskStatus;
  statusCode: number;
}

export interface CommitmentRecord {
  task: BuyerTask;
  commitmentHash: Bytes32;
  commitmentURI: URI;
  commitment: ExecutionCommitment;
}

export interface CommitmentExpectations {
  acceptedHosts?: string[];
  acceptedPaths?: string[];
  acceptedMethods?: string[];
  acceptedModels?: string[];
  expectedVerifier?: string;
  minTotalTokens?: number;
  requireNonZeroMinUsage?: boolean;
  nowMs?: UIntLike;
}

export interface ValidatedCommitment extends CommitmentRecord {
  expectationsApplied: Required<Pick<CommitmentExpectations, "requireNonZeroMinUsage">> &
    Omit<CommitmentExpectations, "requireNonZeroMinUsage">;
}

export interface FundTaskOptions {
  validateCommitment?: CommitmentExpectations;
}

export interface VerificationReportResolver {
  getReport(input: { task: BuyerTask; taskId: Bytes32; reportHash: Bytes32 }): Promise<VerificationReport | null>;
}

export interface BuyerReportRecord {
  task: BuyerTask;
  reportHash: Bytes32 | null;
  report: VerificationReport | null;
}

export interface BuyerSdkConfig {
  settlementAddress: string;
  signer: Signer;
  storage?: StorageAdapter;
  reportResolver?: VerificationReportResolver;
}

export interface ContractTiming {
  currentTimeMs: UIntString;
  proofSubmissionGracePeriodMs: UIntString;
  verificationTimeoutMs: UIntString;
}

export class BuyerSdkConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuyerSdkConfigurationError";
  }
}

export class BuyerSdkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuyerSdkValidationError";
  }
}
