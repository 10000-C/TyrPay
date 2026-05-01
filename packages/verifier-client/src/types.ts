import type { HexString, VerificationReport, VerificationReportStruct } from "@fulfillpay/sdk-core";

export interface VerifierClientConfig {
  contractAddress: HexString;
  signer: import("ethers").Signer;
  verifierServiceUrl: string;
  chainId: number;
}

export interface SettleParams {
  report: VerificationReportStruct;
  signature: HexString;
}

export interface SettleResult {
  taskId: HexString;
  txHash: HexString;
}

export interface VerifyAndSettleResult {
  taskId: HexString;
  txHash: HexString;
  report: VerificationReport;
}
