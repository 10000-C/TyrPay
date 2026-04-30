import { canonicalize, hashObject, type Bytes32, type URI } from "@fulfillpay/sdk-core";

import type { GetObjectOptions, PutObjectOptions, StoragePointer } from "./types.js";
import { StorageConfigurationError, StorageIntegrityError } from "./types.js";

const HASH_FILE_PATTERN = /^(0x[0-9a-f]{64})\.json$/;
const SAFE_NAMESPACE_SEGMENT_PATTERN = /^[a-z0-9-]+$/;

export interface PreparedStoredObject<T> {
  canonical: string;
  hash: Bytes32;
  object: T;
}

export function prepareStoredObject<T>(value: T): PreparedStoredObject<T> {
  const canonical = canonicalize(value);
  const object = parseStoredJson<T>(canonical, "Failed to normalize canonical storage payload.");

  return {
    canonical,
    hash: hashObject(object),
    object
  };
}

export function parseStoredJson<T>(payload: string, messagePrefix = "Stored payload is not valid JSON."): T {
  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    throw new StorageIntegrityError(`${messagePrefix} ${toErrorMessage(error)}`);
  }
}

export function assertStoredHash<T>(payload: T, expectedHash: Bytes32, uri: URI): void {
  const actualHash = hashObject(payload);

  if (actualHash !== expectedHash) {
    throw new StorageIntegrityError(`Stored object hash mismatch for ${uri}. Expected ${expectedHash}, received ${actualHash}.`);
  }
}

export function resolveExpectedHash(pointerOrUri: StoragePointer | URI, options: GetObjectOptions = {}): Bytes32 {
  if (typeof pointerOrUri !== "string") {
    return pointerOrUri.hash;
  }

  if (options.expectedHash) {
    return options.expectedHash;
  }

  const inferredHash = inferHashFromUri(pointerOrUri);

  if (!inferredHash) {
    throw new StorageConfigurationError(`expectedHash is required when URI does not encode a canonical object hash: ${pointerOrUri}`);
  }

  return inferredHash;
}

export function toUri(pointerOrUri: StoragePointer | URI): URI {
  return typeof pointerOrUri === "string" ? pointerOrUri : pointerOrUri.uri;
}

export function buildOpaqueStorageUri(scheme: string, namespace: string, hash: Bytes32): URI {
  const normalizedNamespace = normalizeNamespace(namespace);
  return `${scheme}://storage/${normalizedNamespace}/${hash}.json`;
}

export function normalizeNamespace(namespace: PutObjectOptions["namespace"]): string {
  const candidate = namespace?.trim() || "objects";
  const normalized = candidate
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return "objects";
  }

  for (const segment of normalized) {
    if (!SAFE_NAMESPACE_SEGMENT_PATTERN.test(segment)) {
      throw new StorageConfigurationError(
        `Invalid namespace segment "${segment}". Namespaces may contain lowercase letters, digits, and hyphens.`
      );
    }
  }

  return normalized.join("/");
}

function inferHashFromUri(uri: URI): Bytes32 | null {
  try {
    const pathname = new URL(uri).pathname;
    const fileName = pathname.split("/").filter(Boolean).at(-1);

    if (!fileName) {
      return null;
    }

    const match = HASH_FILE_PATTERN.exec(fileName);
    return (match?.[1] as Bytes32 | undefined) ?? null;
  } catch {
    return null;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
