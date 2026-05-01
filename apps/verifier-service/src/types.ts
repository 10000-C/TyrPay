import type { HexString, VerificationReport, StorageProvider, ZkTLSProvider } from "@fulfillpay/sdk-core";

export interface VerifierServiceConfig {
  port: number;
  host: string;
  contractAddress: HexString;
  verifierPrivateKey: HexString;
  chainId: number;
  storage: StorageProvider;
  zktls: ZkTLSProvider;
}

export interface VerificationRequest {
  taskId: HexString;
}

export interface VerificationResponse {
  success: boolean;
  report?: VerificationReport;
  signature?: HexString;
  error?: string;
}

export interface VerificationStatus {
  taskId: HexString;
  status: "pending" | "verified" | "failed" | "settled";
  reportHash?: HexString;
  verifiedAt?: string;
}
