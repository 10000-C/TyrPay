import type { SellerAgent, ContractLike } from "@fulfillpay/seller-sdk";

export interface FulfillPayTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(input: unknown): Promise<unknown>;
}

export type SellerTool = FulfillPayTool;

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
  getTask(taskId: string): Promise<RawOnChainTask>;
}

export interface SellerSkillConfig {
  agent: SellerAgent;
  contract: ReadableContractLike;
  /** Address of the verifier contract used in commitments. */
  verifier: string;
}
