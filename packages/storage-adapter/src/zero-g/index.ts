import type { Bytes32, URI } from "@fulfillpay/sdk-core";

import type { GetObjectOptions, PutObjectOptions, StorageAdapter, StoragePointer } from "../types.js";
import { StorageConfigurationError, StorageNotFoundError } from "../types.js";
import {
  assertStoredHash,
  parseStoredJson,
  prepareStoredObject,
  resolveExpectedHash,
  toUri
} from "../utils.js";

export interface ZeroGPutRequest {
  canonical: string;
  hash: Bytes32;
  namespace: string;
}

export interface ZeroGStorageTransport {
  putObject(request: ZeroGPutRequest): Promise<{ uri: URI }>;
  getObject(uri: URI): Promise<string>;
}

export interface ZeroGStorageAdapterOptions {
  transport?: ZeroGStorageTransport;
}

export class ZeroGStorageAdapter implements StorageAdapter {
  readonly kind = "0g";

  constructor(private readonly options: ZeroGStorageAdapterOptions = {}) {}

  async putObject<T>(value: T, options: PutObjectOptions = {}): Promise<StoragePointer> {
    const transport = this.requireTransport();
    const prepared = prepareStoredObject(value);
    const result = await transport.putObject({
      canonical: prepared.canonical,
      hash: prepared.hash,
      namespace: options.namespace ?? "objects"
    });

    return {
      uri: result.uri,
      hash: prepared.hash
    };
  }

  async getObject<T>(pointerOrUri: StoragePointer | URI, options: GetObjectOptions = {}): Promise<T> {
    const transport = this.requireTransport();
    const uri = toUri(pointerOrUri);
    const expectedHash = resolveExpectedHash(pointerOrUri, options);
    let payloadText: string;

    try {
      payloadText = await transport.getObject(uri);
    } catch (error) {
      if (isMissingObjectError(error)) {
        throw new StorageNotFoundError(`Stored object not found: ${uri}`);
      }

      throw error;
    }

    const payload = parseStoredJson<T>(payloadText, `Stored object at ${uri} is not valid JSON.`);

    assertStoredHash(payload, expectedHash, uri);
    return payload;
  }

  private requireTransport(): ZeroGStorageTransport {
    if (!this.options.transport) {
      throw new StorageConfigurationError("ZeroGStorageAdapter requires a transport implementation.");
    }

    return this.options.transport;
  }
}

function isMissingObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  const status = "status" in error ? error.status : undefined;
  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  const message = error.message.toLowerCase();

  return (
    error instanceof StorageNotFoundError ||
    code === "ENOENT" ||
    code === "NOT_FOUND" ||
    status === 404 ||
    statusCode === 404 ||
    error.name === "NotFoundError" ||
    message.includes("not found") ||
    message.includes("missing payload")
  );
}
