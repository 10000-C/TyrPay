import type { BuyerTask, CommitmentExpectations } from "@tyrpay/buyer-sdk";
import type { DerivedTaskStatus } from "@tyrpay/sdk-core";

export interface TyrPayTool<TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(input: unknown): Promise<TResult>;
}

export type BuyerTool<TResult = unknown> = TyrPayTool<TResult>;

export type BuyerUserStatus =
  | "WAITING_FOR_SELLER"
  | "READY_TO_FUND"
  | "IN_PROGRESS"
  | "AWAITING_VERIFICATION"
  | "COMPLETED"
  | "REFUNDED"
  | "EXPIRED"
  | "VERIFIED_PASS"
  | "VERIFIED_FAIL"
  | "REFUND_IN_PROGRESS";

export interface BuyerStatusView {
  userStatus: BuyerUserStatus;
  userMessage: string;
}

export interface BuyerTaskStatusResult extends BuyerTask, BuyerStatusView {
  derivedStatus: DerivedTaskStatus;
}

export interface PostTaskInput {
  seller: string;
  token: string;
  amount: string;
  deadline: string;
  metadataHash?: string;
  metadataURI?: string;
  expectations?: CommitmentExpectations;
  pollIntervalMs?: number;
  timeoutMs?: number;
  createOnly?: boolean;
}

export interface PostTaskResult extends BuyerStatusView {
  taskId: string;
  taskNonce: string;
  createTxHash: string;
  fundTxHash?: string;
  commitmentHash?: string | null;
  commitmentURI?: string | null;
  timedOut?: boolean;
}

export interface FundTaskInput {
  taskId: string;
  expectations: CommitmentExpectations;
}

export interface FundTaskResult extends BuyerStatusView {
  taskId: string;
  fundTxHash: string;
  commitmentHash: string;
  commitmentURI: string;
}

export interface CheckTaskInput {
  taskId: string;
}

export interface RefundTaskInput {
  taskId: string;
  reason: "proof_submission_deadline" | "verification_timeout";
}

export interface RefundTaskResult extends BuyerStatusView {
  taskId: string;
  txHash: string;
}

export interface ListTasksInput {
  taskIds: string[];
}

export type ListTasksResult = BuyerTaskStatusResult[];

export interface ReadyResult {
  ok: true;
  userStatus: "READY";
  userMessage: string;
  signerAddress: string;
}

export type BuyerSkillErrorCode =
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "BUYER_SDK_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export interface BuyerSkillErrorShape {
  code: BuyerSkillErrorCode;
  message: string;
  field?: string;
  received?: unknown;
  suggestion?: string;
  retryable: boolean;
  causeName?: string;
}
