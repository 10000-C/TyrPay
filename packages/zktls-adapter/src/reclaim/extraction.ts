import {
  normalizeUIntString,
  type ExtractedReceiptFields,
  type UnixMillis
} from "@fulfillpay/sdk-core";

import type { ProviderProofContext, ZkTlsResponseEvidence } from "../core/index.js";
import { buildReclaimProofContextBinding } from "./client.js";
import type { ReclaimExtractionProfile, ReclaimProofContextBinding } from "./types.js";

export interface ReclaimProofEvidence {
  providerProofId: string;
  observedAt: UnixMillis;
  response: ZkTlsResponseEvidence;
  extracted: ExtractedReceiptFields;
}

export function extractReclaimProofEvidence(
  proof: unknown,
  profile: ReclaimExtractionProfile = { mode: "openai-compatible", responseBodySource: "auto" }
): ReclaimProofEvidence {
  if (profile.mode !== "openai-compatible") {
    throw new TypeError(`Unsupported Reclaim extraction profile: ${profile.mode}.`);
  }

  const responseBody = extractResponseBody(proof, profile);
  const parsedBody = parseMaybeJson(responseBody);
  const extracted = extractOpenAiCompatibleFields(parsedBody);

  return {
    providerProofId: extractProviderProofId(proof),
    observedAt: extractObservedAt(proof),
    response: {
      status: extractResponseStatus(proof),
      body: parsedBody
    },
    extracted
  };
}

export function assertReclaimProofContextBound(proof: unknown, expectedProofContext: ProviderProofContext): void {
  const actual = extractReclaimProofContextBinding(proof);
  const expected = buildReclaimProofContextBinding(expectedProofContext);

  if (!actual) {
    throw new TypeError("Reclaim proof does not include FulfillPay proof context binding.");
  }

  if (
    actual.protocol !== expected.protocol ||
    actual.version !== expected.version ||
    actual.provider !== expected.provider ||
    actual.proofContextHash !== expected.proofContextHash ||
    !providerProofContextsEqual(actual.proofContext, expected.proofContext)
  ) {
    throw new TypeError("Reclaim proof context binding does not match FulfillPay proof context.");
  }
}

export function extractReclaimProofContextBinding(proof: unknown): ReclaimProofContextBinding | null {
  const object = asRecord(proof, "reclaimProof");
  const candidates = [
    object.context,
    readPath(object, ["claimData", "context"]),
    readPath(object, ["claimData", "parameters", "context"]),
    readPath(object, ["publicOptions", "context"])
  ];

  for (const candidate of candidates) {
    const parsed = parseContextCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractProviderProofId(proof: unknown): string {
  const object = asRecord(proof, "reclaimProof");
  const candidates = [
    object.identifier,
    object.providerProofId,
    object.id,
    readPath(object, ["claimData", "identifier"])
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  throw new TypeError("Reclaim proof does not include a provider proof identifier.");
}

function extractObservedAt(proof: unknown): UnixMillis {
  const object = asRecord(proof, "reclaimProof");
  const millisecondCandidates = [
    object.observedAt,
    object.timestamp,
    object.timestampMs,
    readPath(object, ["claimData", "timestampMs"])
  ];

  for (const candidate of millisecondCandidates) {
    if (typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "bigint") {
      return normalizeUIntString(candidate, "reclaimProof.observedAt") as UnixMillis;
    }
  }

  const timestampSeconds = readPath(object, ["claimData", "timestampS"]);
  if (typeof timestampSeconds === "string" || typeof timestampSeconds === "number" || typeof timestampSeconds === "bigint") {
    return normalizeUIntString(BigInt(timestampSeconds) * 1000n, "reclaimProof.observedAt") as UnixMillis;
  }

  throw new TypeError("Reclaim proof does not include an observed timestamp.");
}

function extractResponseStatus(proof: unknown): number {
  const object = asRecord(proof, "reclaimProof");
  const status = readPath(object, ["response", "status"]) ?? object.status;

  if (typeof status === "number" && Number.isSafeInteger(status) && status >= 100 && status <= 599) {
    return status;
  }

  return 200;
}

function extractResponseBody(proof: unknown, profile: ReclaimExtractionProfile): unknown {
  const object = asRecord(proof, "reclaimProof");

  if (profile.responseBodySource === "extractedParameterValues.data") {
    return requireValue(readPath(object, ["extractedParameterValues", "data"]), "extractedParameterValues.data");
  }

  if (profile.responseBodySource === "response.body") {
    return requireValue(readPath(object, ["response", "body"]), "response.body");
  }

  const candidates = [
    readPath(object, ["extractedParameterValues", "data"]),
    readPath(object, ["extractedParameterValues", "response"]),
    readPath(object, ["extractedParameterValues", "body"]),
    readPath(object, ["response", "body"]),
    object.responseBody,
    object.body
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }

  throw new TypeError("Reclaim proof does not include a response body.");
}

function extractOpenAiCompatibleFields(body: unknown): ExtractedReceiptFields {
  const object = asRecord(body, "OpenAI-compatible response body");
  const model = object.model;
  const usage = asRecord(object.usage, "OpenAI-compatible response body.usage");
  const totalTokens = usage.total_tokens ?? usage.totalTokens;

  if (typeof model !== "string" || model.length === 0) {
    throw new TypeError("OpenAI-compatible response body must include model.");
  }

  if (typeof totalTokens !== "number" || !Number.isSafeInteger(totalTokens) || totalTokens < 0) {
    throw new TypeError("OpenAI-compatible response body must include usage.total_tokens.");
  }

  return {
    model,
    usage: {
      totalTokens
    }
  };
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return sanitizeCanonicalJsonShape(value);
  }

  const decoded = decodeChunkedResponse(value).trim();
  if (!decoded) {
    throw new TypeError("Response body is empty.");
  }

  return sanitizeCanonicalJsonShape(JSON.parse(decoded));
}

function decodeChunkedResponse(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let index = 0;
  let decoded = "";
  let consumedChunk = false;

  while (index < lines.length) {
    const sizeLine = lines[index]?.trim();
    if (!sizeLine || !/^[0-9a-f]+(?:;.*)?$/i.test(sizeLine)) {
      break;
    }

    const size = Number.parseInt(sizeLine.split(";")[0] ?? "", 16);
    index += 1;

    if (size === 0) {
      consumedChunk = true;
      break;
    }

    const chunk = lines[index] ?? "";
    decoded += chunk.slice(0, size);
    consumedChunk = true;
    index += 1;
  }

  return consumedChunk ? decoded : value;
}

function requireValue(value: unknown, fieldName: string): unknown {
  if (value === undefined || value === null) {
    throw new TypeError(`Reclaim proof does not include ${fieldName}.`);
  }

  return value;
}

function readPath(object: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = object;

  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function parseContextCandidate(candidate: unknown): ReclaimProofContextBinding | null {
  const parsed = typeof candidate === "string" ? parseJsonObject(candidate) : candidate;
  if (!isRecord(parsed)) {
    return null;
  }

  const object = isRecord(parsed.fulfillpay) ? parsed.fulfillpay : parsed;
  const proofContext = object.proofContext;

  if (
    object.protocol !== "FulfillPay" ||
    object.version !== 1 ||
    object.provider !== "reclaim" ||
    typeof object.proofContextHash !== "string" ||
    !isProviderProofContext(proofContext)
  ) {
    return null;
  }

  return {
    protocol: object.protocol,
    version: object.version,
    provider: object.provider,
    proofContextHash: object.proofContextHash as ReclaimProofContextBinding["proofContextHash"],
    proofContext
  };
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isProviderProofContext(value: unknown): value is ProviderProofContext {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.protocol === "string" &&
    typeof value.version === "number" &&
    typeof value.chainId === "string" &&
    typeof value.settlementContract === "string" &&
    typeof value.taskId === "string" &&
    typeof value.taskNonce === "string" &&
    typeof value.commitmentHash === "string" &&
    typeof value.buyer === "string" &&
    typeof value.seller === "string" &&
    typeof value.callIndex === "number" &&
    typeof value.callIntentHash === "string"
  );
}

function providerProofContextsEqual(left: ProviderProofContext, right: ProviderProofContext): boolean {
  return (
    left.protocol === right.protocol &&
    left.version === right.version &&
    left.chainId === right.chainId &&
    left.settlementContract === right.settlementContract &&
    left.taskId === right.taskId &&
    left.taskNonce === right.taskNonce &&
    left.commitmentHash === right.commitmentHash &&
    left.buyer === right.buyer &&
    left.seller === right.seller &&
    left.callIndex === right.callIndex &&
    left.callIntentHash === right.callIntentHash
  );
}

function asRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${fieldName} must be a plain object.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeCanonicalJsonShape(value: unknown): unknown {
  if (value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeCanonicalJsonShape(item))
      .filter((item) => item !== undefined);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const sanitized = sanitizeCanonicalJsonShape(item);
      return sanitized === undefined ? [] : [[key, sanitized]];
    })
  );
}
