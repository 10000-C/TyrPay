import type {
  Bytes32,
  ExtractedReceiptFields,
  TaskContext,
  UnixMillis
} from "@fulfillpay/sdk-core";

import type {
  ProviderProofContext,
  ZkTlsRequestEvidence,
  ZkTlsResponseEvidence
} from "../core/index.js";

export const RECLAIM_ZKTLS_PROVIDER = "reclaim" as const;
export const RECLAIM_RAW_PROOF_SCHEMA_VERSION = "fulfillpay.reclaim-zktls-proof.v1" as const;

export interface ReclaimZkFetchAdapterConfig {
  appId?: string;
  appSecret?: string;
  defaultUseTee?: boolean;
  enableLogs?: boolean;
  defaultRetries?: number;
  defaultRetryIntervalMs?: number;
  clientFactory?: ReclaimClientFactory;
  verifyProof?: ReclaimProofVerifier;
}

export type ReclaimClientFactory = (input: ReclaimClientFactoryInput) => Promise<ReclaimClientLike> | ReclaimClientLike;

export interface ReclaimClientFactoryInput {
  appId: string;
  appSecret: string;
  logs?: boolean;
}

export interface ReclaimClientLike {
  zkFetch(
    url: string,
    publicOptions: ReclaimPublicOptions,
    privateOptions?: ReclaimPrivateOptions,
    retries?: number,
    retryInterval?: number
  ): Promise<unknown>;
}

export type ReclaimProofVerifier = (proof: unknown) => Promise<boolean> | boolean;

export interface ReclaimPublicOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  context: Record<string, unknown>;
  useTee?: boolean;
}

export interface ReclaimPrivateOptions {
  headers?: Record<string, string>;
  body?: string;
  cookieStr?: string;
  paramValues?: Record<string, string>;
  responseMatches?: Array<{ type: "contains" | "regex"; value: string }>;
  responseRedactions?: Array<{
    jsonPath?: string;
    xPath?: string;
    regex?: string;
  }>;
}

export interface ReclaimExtractionProfile {
  mode: "openai-compatible";
  responseBodySource?: "auto" | "extractedParameterValues.data" | "response.body";
}

export interface ReclaimProvenFetchInput {
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: Bytes32;
  request: ZkTlsRequestEvidence;
  declaredModel: string;
  privateOptions?: ReclaimPrivateOptions;
  retries?: number;
  retryIntervalMs?: number;
  useTee?: boolean;
  extractionProfile?: ReclaimExtractionProfile;
}

export interface ReclaimRawProofPayload {
  proofSchemaVersion: typeof RECLAIM_RAW_PROOF_SCHEMA_VERSION;
  provider: typeof RECLAIM_ZKTLS_PROVIDER;
  providerProofId: string;
  proofContext: ProviderProofContext;
  request: ZkTlsRequestEvidence;
  response: ZkTlsResponseEvidence;
  observedAt: UnixMillis;
  extracted: ExtractedReceiptFields;
  reclaimProof: unknown;
  metadata: {
    url: string;
    useTee: boolean;
    retries: number;
    retryIntervalMs: number;
  };
}

export interface ReclaimRawProof extends ReclaimRawProofPayload {
  proofHash: Bytes32;
}

export interface ReclaimProofContextBinding {
  protocol: "FulfillPay";
  version: 1;
  provider: typeof RECLAIM_ZKTLS_PROVIDER;
  proofContextHash: Bytes32;
  proofContext: ProviderProofContext;
}
