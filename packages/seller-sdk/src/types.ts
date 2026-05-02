import type { Bytes32, Address, UIntLike, URI, ExecutionCommitment, TaskContext, DeliveryReceipt, ProofBundle } from "@fulfillpay/sdk-core";
import type { StorageAdapter, StoragePointer } from "@fulfillpay/storage-adapter";
import type { ZkTlsAdapter } from "@fulfillpay/zktls-adapter";

/**
 * Configuration for the Seller SDK / SellerAgent.
 */
export interface SellerConfig {
  /** Ethers.js Signer for the seller's wallet (used for on-chain txs) */
  signer: Signer;
  /** Address of the FulfillPaySettlement contract */
  settlementContract: Address;
  /** Chain ID as a number or string */
  chainId: UIntLike;
  /** Storage adapter for uploading proof bundles */
  storageAdapter: StorageAdapter;
  /** zkTLS adapter for proven fetches */
  zkTlsAdapter: ZkTlsAdapter;
}

/**
 * Result of submitting a commitment on-chain.
 */
export interface SubmitCommitmentResult {
  /** Transaction hash */
  txHash: string;
  /** The taskId that was committed */
  taskId: Bytes32;
  /** The commitmentHash submitted */
  commitmentHash: Bytes32;
  /** The commitmentURI submitted */
  commitmentURI: URI;
}

/**
 * Result of submitting a proof bundle hash on-chain.
 */
export interface SubmitProofBundleHashResult {
  /** Transaction hash */
  txHash: string;
  /** The taskId for which proof was submitted */
  taskId: Bytes32;
  /** The proofBundleHash submitted */
  proofBundleHash: Bytes32;
  /** The proofBundleURI submitted */
  proofBundleURI: URI;
}

/**
 * Result of uploading a proof bundle to storage.
 */
export interface UploadProofBundleResult {
  /** Storage pointer (uri + hash) */
  pointer: StoragePointer;
  /** The uploaded ProofBundle */
  bundle: ProofBundle;
}

/**
 * Result of the full seller flow (commitment → proven fetch → proof bundle → submit).
 */
export interface SellerFlowResult {
  commitment: SubmitCommitmentResult;
  receipts: DeliveryReceipt[];
  proofBundle: ProofBundle;
  upload: UploadProofBundleResult;
  proofSubmission: SubmitProofBundleHashResult;
}

/**
 * Minimal ethers.js Signer interface needed by Seller SDK.
 * This avoids a direct import of the full ethers Signer type.
 */
export interface Signer {
  getAddress(): Promise<string>;
  signTransaction(transaction: Record<string, unknown>): Promise<string>;
  sendTransaction(transaction: Record<string, unknown>): Promise<{ hash: string; wait(confirmations?: number): Promise<void> }>;
}

/**
 * Minimal ethers.js Contract interface needed by Seller SDK.
 */
export interface ContractLike {
  submitCommitment(taskId: string, commitmentHash: string, commitmentURI: string): Promise<{ hash: string; wait(confirmations?: number): Promise<void> }>;
  submitProofBundle(taskId: string, proofBundleHash: string, proofBundleURI: string): Promise<{ hash: string; wait(confirmations?: number): Promise<void> }>;
}