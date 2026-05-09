import {
  SCHEMA_VERSIONS,
  hashObject,
  normalizeBytes32,
  type Bytes32,
  type DeliveryReceipt
} from "@fulfillpay/sdk-core";

import {
  assertReceiptContextMatchesProofContext,
  buildProviderProofContext,
  hashRequestEvidence,
  hashResponseEvidence,
  normalizeRequestEvidence,
  normalizeResponseEvidence,
  type ProvenFetchResult,
  type ZkTlsAdapter,
  type ZkTlsReceiptContext,
  type ZkTlsResponseEvidence
} from "../core/index.js";

import {
  buildReclaimPrivateOptions,
  buildReclaimPublicOptions,
  buildReclaimUrl,
  createReclaimClient
} from "./client.js";
import { assertReclaimProofContextBound, extractReclaimProofEvidence } from "./extraction.js";
import {
  RECLAIM_RAW_PROOF_SCHEMA_VERSION,
  RECLAIM_ZKTLS_PROVIDER,
  type ReclaimProvenFetchInput,
  type ReclaimProofVerifier,
  type ReclaimRawProof,
  type ReclaimRawProofPayload,
  type ReclaimZkFetchAdapterConfig
} from "./types.js";

const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export class ReclaimZkTlsAdapter
  implements ZkTlsAdapter<ReclaimRawProof, ReclaimProvenFetchInput, ZkTlsResponseEvidence["body"]>
{
  readonly name = RECLAIM_ZKTLS_PROVIDER;

  constructor(private readonly config: ReclaimZkFetchAdapterConfig = {}) {}

  async provenFetch(
    input: ReclaimProvenFetchInput
  ): Promise<ProvenFetchResult<ReclaimRawProof, ZkTlsResponseEvidence["body"]>> {
    const request = normalizeRequestEvidence(input.request);
    const useTee = input.useTee ?? this.config.defaultUseTee ?? false;
    const retries = input.retries ?? this.config.defaultRetries ?? 1;
    const retryIntervalMs = input.retryIntervalMs ?? this.config.defaultRetryIntervalMs ?? 1000;
    const url = buildReclaimUrl(input);
    const client = await createReclaimClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      logs: this.config.enableLogs,
      clientFactory: this.config.clientFactory
    });
    const proofContext = buildProviderProofContext(input);
    const reclaimProof = await client.zkFetch(
      url,
      buildReclaimPublicOptions(input, proofContext),
      buildReclaimPrivateOptions(input),
      retries,
      retryIntervalMs
    );
    assertReclaimProofContextBound(reclaimProof, proofContext);
    const evidence = extractReclaimProofEvidence(reclaimProof, input.extractionProfile);
    const response = normalizeResponseEvidence(evidence.response);
    const payload: ReclaimRawProofPayload = {
      proofSchemaVersion: RECLAIM_RAW_PROOF_SCHEMA_VERSION,
      provider: RECLAIM_ZKTLS_PROVIDER,
      providerProofId: evidence.providerProofId,
      proofContext,
      request,
      response,
      observedAt: evidence.observedAt,
      extracted: evidence.extracted,
      reclaimProof,
      metadata: {
        url,
        useTee,
        retries,
        retryIntervalMs
      }
    };
    const rawProof: ReclaimRawProof = {
      ...payload,
      proofHash: hashReclaimRawProofPayload(payload)
    };

    return {
      response: rawProof.response.body,
      rawProof,
      extracted: rawProof.extracted
    };
  }

  async verifyRawProof(rawProof: ReclaimRawProof): Promise<boolean> {
    try {
      assertReclaimRawProof(rawProof);
      const payloadHashMatched = hashReclaimRawProofPayload(toReclaimRawProofPayload(rawProof)) === rawProof.proofHash;
      if (!payloadHashMatched) {
        return false;
      }

      const verifyProof = this.config.verifyProof ?? defaultVerifyReclaimProof;
      if (!(await verifyProof(rawProof.reclaimProof))) {
        return false;
      }

      assertReclaimProofContextBound(rawProof.reclaimProof, rawProof.proofContext);
      const verifiedEvidence = extractReclaimProofEvidence(rawProof.reclaimProof);
      return reclaimEnvelopeMatchesNativeProof(rawProof, verifiedEvidence);
    } catch {
      return false;
    }
  }

  async normalizeReceipt(rawProof: ReclaimRawProof, context: ZkTlsReceiptContext): Promise<DeliveryReceipt> {
    if (!(await this.verifyRawProof(rawProof))) {
      throw new TypeError("Reclaim raw proof failed verification.");
    }

    assertReceiptContextMatchesProofContext(rawProof.proofContext, context);
    assertString(context.rawProofURI, "rawProofURI");

    return {
      schemaVersion: SCHEMA_VERSIONS.deliveryReceipt,
      taskContext: context.taskContext,
      callIndex: context.callIndex,
      callIntentHash: normalizeBytes32(context.callIntentHash, "callIntentHash"),
      provider: rawProof.provider,
      providerProofId: rawProof.providerProofId,
      requestHash: hashRequestEvidence(rawProof.request),
      responseHash: hashResponseEvidence(rawProof.response),
      observedAt: rawProof.observedAt,
      extracted: rawProof.extracted,
      rawProofHash: hashReclaimRawProof(rawProof),
      rawProofURI: context.rawProofURI
    };
  }

  async extractReceiptEvidence(rawProof: unknown) {
    try {
      assertReclaimRawProof(rawProof);
      return {
        provider: rawProof.provider,
        providerProofId: rawProof.providerProofId,
        request: rawProof.request,
        response: rawProof.response,
        observedAt: rawProof.observedAt,
        extracted: rawProof.extracted
      };
    } catch {
      return null;
    }
  }
}

function reclaimEnvelopeMatchesNativeProof(
  rawProof: ReclaimRawProof,
  evidence: ReturnType<typeof extractReclaimProofEvidence>
): boolean {
  try {
    return (
      rawProof.providerProofId === evidence.providerProofId &&
      rawProof.observedAt === evidence.observedAt &&
      hashResponseEvidence(rawProof.response) === hashResponseEvidence(evidence.response) &&
      rawProof.extracted.model === evidence.extracted.model &&
      rawProof.extracted.usage.totalTokens === evidence.extracted.usage.totalTokens
    );
  } catch {
    return false;
  }
}

export function hashReclaimRawProofPayload(payload: ReclaimRawProofPayload): Bytes32 {
  assertReclaimRawProofPayload(payload);
  return hashObject(payload);
}

export function hashReclaimRawProof(rawProof: ReclaimRawProof): Bytes32 {
  assertReclaimRawProof(rawProof);
  return hashObject(rawProof);
}

export function toReclaimRawProofPayload(rawProof: ReclaimRawProof): ReclaimRawProofPayload {
  const { proofHash: _proofHash, ...payload } = rawProof;
  return payload;
}

export async function defaultVerifyReclaimProof(proof: unknown): Promise<boolean> {
  const module = (await dynamicImport("@reclaimprotocol/js-sdk")) as {
    verifyProof?: (proof: unknown, config: Record<string, unknown>) => Promise<unknown>;
  };

  if (typeof module.verifyProof !== "function") {
    throw new TypeError("@reclaimprotocol/js-sdk does not export verifyProof.");
  }

  const verificationConfig = buildReclaimVerificationConfig(proof);
  const result = await module.verifyProof(proof, verificationConfig);

  if (typeof result === "boolean") {
    return result;
  }

  if (isPlainRecord(result) && typeof result.isVerified === "boolean") {
    return result.isVerified;
  }

  throw new TypeError("@reclaimprotocol/js-sdk verifyProof returned an unsupported result.");
}

export * from "./client.js";
export * from "./extraction.js";
export * from "./types.js";

function assertReclaimRawProof(rawProof: unknown): asserts rawProof is ReclaimRawProof {
  assertReclaimRawProofPayload(rawProof);
  const object = rawProof as ReclaimRawProof;
  normalizeBytes32(object.proofHash, "proofHash");
}

function assertReclaimRawProofPayload(payload: unknown): asserts payload is ReclaimRawProofPayload {
  const object = assertRecord(payload, "ReclaimRawProofPayload");

  if (object.proofSchemaVersion !== RECLAIM_RAW_PROOF_SCHEMA_VERSION) {
    throw new TypeError("proofSchemaVersion must be fulfillpay.reclaim-zktls-proof.v1.");
  }

  if (object.provider !== RECLAIM_ZKTLS_PROVIDER) {
    throw new TypeError("provider must be reclaim.");
  }

  assertString(object.providerProofId, "providerProofId");
  assertRecord(object.proofContext, "proofContext");
  normalizeRequestEvidence(object.request as never);
  normalizeResponseEvidence(object.response as never);
  assertString(object.observedAt, "observedAt");
  assertRecord(object.extracted, "extracted");
  assertRecord(object.metadata, "metadata");
}

function assertRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be a plain object.`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${fieldName} must be a plain object.`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
}

function buildReclaimVerificationConfig(proof: unknown): Record<string, unknown> {
  const object = assertRecord(proof, "reclaimProof");
  const claimData = assertRecord(object.claimData, "reclaimProof.claimData");
  const parsedContext = parseJsonObject(claimData.context);

  if (
    isPlainRecord(parsedContext) &&
    typeof parsedContext.providerHash === "string" &&
    parsedContext.providerHash.length > 0
  ) {
    return {
      hashes: [parsedContext.providerHash]
    };
  }

  if (typeof claimData.provider === "string" && claimData.provider.length > 0) {
    return {
      providerId: claimData.provider
    };
  }

  throw new TypeError("Reclaim proof does not include provider verification metadata.");
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
