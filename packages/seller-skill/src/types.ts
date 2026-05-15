import type { SellerAgent, ContractLike } from "@tyrpay/seller-sdk";

export interface TyrPayTool<TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(input: unknown): Promise<TResult>;
}

export type SellerTool<TResult = unknown> = TyrPayTool<TResult>;

/** Raw task struct as returned by the settlement contract's getTask(). */
export interface RawOnChainTask {
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
}

/** ContractLike extended with a read-only getTask method for seller-side queries. */
export interface ReadableContractLike extends ContractLike {
  getTask(taskId: string): Promise<unknown>;
}

export interface SellerSkillConfig {
  agent: SellerAgent;
  contract: ReadableContractLike;
  /** Registry-authorized verifier signer address embedded into ExecutionCommitment. */
  verifierSignerAddress?: string;
  /**
   * @deprecated Use verifierSignerAddress. This is a verifier signer address,
   * not a settlement contract, verifier registry, service URL, or verifier contract address.
   */
  verifier?: string;
}

export interface ModelEndpointDiscoveryInput {
  model: string;
  provider?: string;
  requestPath?: string;
  limit?: number;
  requireReachableEndpoint?: boolean;
}

export interface DiscoveredModelEndpoint {
  provider: string;
  providerAddress?: string;
  endpoint: string;
  host: string;
  path: string;
  method: string;
  model: string;
  requestPath?: string;
  serviceType?: string | null;
  verifiability?: string | null;
  reachable?: boolean;
  providerOptions?: Record<string, unknown>;
}

export interface ModelEndpointDiscoveryResult {
  model: string;
  provider: string;
  endpoints: DiscoveredModelEndpoint[];
  recommended: DiscoveredModelEndpoint | null;
  userStatus: "ENDPOINT_READY" | "NO_ENDPOINT_FOUND";
  userMessage: string;
}

// --- Seller-facing statuses ---

export type SellerUserStatus =
  | "READY_TO_ACCEPT"
  | "WAITING_FOR_BUYER_FUNDING"
  | "READY_TO_EXECUTE"
  | "PROOF_CAPTURED"
  | "AWAITING_VERIFICATION"
  | "PAID"
  | "NOT_PAID_REFUNDED"
  | "UNKNOWN";

export interface SellerStatusView {
  userStatus: SellerUserStatus;
  userMessage: string;
}

// --- Tool input types ---

export interface AcceptTaskInput {
  taskId: string;
  host: string;
  path: string;
  method: string;
  allowedModels: string[];
  minTotalTokens: number;
  deadline: string;
}

export interface AcceptTaskResult extends SellerStatusView {
  txHash: string;
  taskId: string;
  commitmentHash: string;
  commitmentURI: string;
  commitment: unknown;
}

export interface ExecuteTaskInput {
  taskId?: string;
  commitment?: Record<string, unknown>;
  taskNonce?: string;
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
  provider?: string;
}

export interface ExecuteTaskResult extends SellerStatusView {
  taskId: string;
  taskNonce: string;
  commitment: unknown;
  receipt: unknown;
  receiptURI: string;
  receiptHash: string;
  rawProofURI: string;
  rawProofHash: string;
}

export interface SubmitProofInput {
  taskId?: string;
  commitment?: Record<string, unknown>;
  receipts: unknown[];
}

export interface SubmitProofResult extends SellerStatusView {
  txHash: string;
  taskId: string;
  proofBundleHash: string;
  proofBundleURI: string;
}

export interface CheckSettlementInput {
  taskId: string;
}

export interface CheckSettlementResult extends SellerStatusView {
  taskId: string;
  status: string;
  settled: boolean;
  refunded: boolean;
  proofSubmittedAt: string | null;
  proofBundleHash: string | null;
  proofBundleURI: string | null;
  settledAt: string | null;
  refundedAt: string | null;
  reportHash: string | null;
}

export interface ReadyResult {
  ok: true;
  userStatus: "READY";
  userMessage: string;
  signerAddress: string;
}

// --- Error types ---

export type SellerSkillErrorCode =
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export interface SellerSkillErrorShape {
  code: SellerSkillErrorCode;
  message: string;
  field?: string;
  received?: unknown;
  suggestion?: string;
  retryable: boolean;
  causeName?: string;
}
