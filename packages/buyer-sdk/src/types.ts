import type { HexString } from "@fulfillpay/sdk-core";

export interface BuyerClientConfig {
  contractAddress: HexString;
  signer: import("ethers").Signer;
  storage: import("@fulfillpay/sdk-core").StorageProvider;
  chainId: number;
}

export interface OnChainTask {
  taskId: HexString;
  taskNonce: HexString;
  buyer: HexString;
  seller: HexString;
  token: HexString;
  amount: bigint;
  deadlineMs: bigint;
  metadataHash: HexString;
  metadataURI: string;
  commitmentHash: HexString;
  commitmentURI: string;
  proofBundleHash: HexString;
  proofBundleURI: string;
  status: number; // SettlementState numeric value
}

export interface CreateTaskIntentParams {
  seller: HexString;
  token: HexString;
  amount: string;
  deadlineMs: string;
  metadataHash?: HexString;
  metadataURI?: string;
}

export interface CreateTaskIntentResult {
  taskId: HexString;
  taskNonce: HexString;
  metadataHash: HexString;
}
