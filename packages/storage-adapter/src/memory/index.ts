import type { URI } from "@tyrpay/sdk-core";

import type { GetObjectOptions, PutObjectOptions, StorageAdapter, StoragePointer } from "../types.js";
import { StorageNotFoundError } from "../types.js";
import {
  assertStoredHash,
  buildOpaqueStorageUri,
  parseStoredJson,
  prepareStoredObject,
  resolveExpectedHash,
  toUri
} from "../utils.js";

interface MemoryStorageRecord {
  canonical: string;
  hash: StoragePointer["hash"];
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly kind = "memory";

  private readonly store = new Map<URI, MemoryStorageRecord>();

  async putObject<T>(value: T, options: PutObjectOptions = {}): Promise<StoragePointer> {
    const prepared = prepareStoredObject(value);
    const uri = buildOpaqueStorageUri("memory", options.namespace ?? "objects", prepared.hash);

    this.store.set(uri, {
      canonical: prepared.canonical,
      hash: prepared.hash
    });

    return {
      uri,
      hash: prepared.hash
    };
  }

  async getObject<T>(pointerOrUri: StoragePointer | URI, options: GetObjectOptions = {}): Promise<T> {
    const uri = toUri(pointerOrUri);
    const record = this.store.get(uri);

    if (!record) {
      throw new StorageNotFoundError(`Stored object not found: ${uri}`);
    }

    const expectedHash = resolveExpectedHash(pointerOrUri, options);
    const payload = parseStoredJson<T>(record.canonical, `Stored object at ${uri} is not valid JSON.`);

    assertStoredHash(payload, expectedHash, uri);
    return payload;
  }
}
