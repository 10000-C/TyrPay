import {
  normalizeUIntString,
  type ExtractedReceiptFields,
  type UnixMillis
} from "@fulfillpay/sdk-core";

import type { ZkTlsResponseEvidence } from "../core/index.js";
import type { ReclaimExtractionProfile } from "./types.js";

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

  return normalizeUIntString(Date.now(), "reclaimProof.observedAt") as UnixMillis;
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
    return value;
  }

  const decoded = decodeChunkedResponse(value).trim();
  if (!decoded) {
    throw new TypeError("Response body is empty.");
  }

  return JSON.parse(decoded);
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
