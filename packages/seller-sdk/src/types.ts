import type { HexString } from "@fulfillpay/sdk-core";

export interface SellerClientConfig {
  contractAddress: HexString;
  signer: import("ethers").Signer;
  storage: import("@fulfillpay/sdk-core").StorageProvider;
  chainId: number;
}

export interface SubmitCommitmentParams {
  taskId: HexString;
  commitment: import("@fulfillpay/sdk-core").ExecutionCommitment;
}

export interface SubmitCommitmentResult {
  taskId: HexString;
  commitmentHash: HexString;
  commitmentURI: string;
}

export interface SubmitProofBundleParams {
  taskId: HexString;
  proofBundle: import("@fulfillpay/sdk-core").ProofBundle;
}

export interface SubmitProofBundleResult {
  taskId: HexString;
  proofBundleHash: HexString;
  proofBundleURI: string;
}
