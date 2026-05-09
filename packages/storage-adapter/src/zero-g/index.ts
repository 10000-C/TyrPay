import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import type { Bytes32, URI } from "@fulfillpay/sdk-core";

import type { GetObjectOptions, PutObjectOptions, StorageAdapter, StoragePointer } from "../types.js";
import { StorageConfigurationError, StorageNotFoundError } from "../types.js";
import {
  assertStoredHash,
  normalizeNamespace,
  parseStoredJson,
  prepareStoredObject,
  resolveExpectedHash,
  toUri
} from "../utils.js";

const ZERO_G_STORAGE_HOST = "storage";
const ZERO_G_STORAGE_PREFIX = `0g://${ZERO_G_STORAGE_HOST}/`;
const HASH_FILE_PATTERN = /^(0x[0-9a-f]{64})\.json$/;
const ROOT_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

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

export interface ZeroGStorageUriParts {
  namespace: string;
  hash: Bytes32;
  rootHash: string;
  txHash?: string;
}

export type ZeroGStorageSigner = Parameters<Indexer["upload"]>[2];
export type ZeroGStorageUploadOptions = Parameters<Indexer["upload"]>[3];
export type ZeroGStorageRetryOptions = Parameters<Indexer["upload"]>[4];
export type ZeroGStorageTransactionOptions = Parameters<Indexer["upload"]>[5];

export interface ZeroGStorageSdkIndexer {
  upload(
    file: MemData,
    blockchainRpc: string,
    signer: ZeroGStorageSigner,
    uploadOptions?: ZeroGStorageUploadOptions,
    retryOptions?: ZeroGStorageRetryOptions,
    transactionOptions?: ZeroGStorageTransactionOptions
  ): Promise<
    [
      | { txHash: string; rootHash: string; txSeq: number }
      | { txHashes: string[]; rootHashes: string[]; txSeqs: number[] },
      Error | null
    ]
  >;
  download(rootHash: string, filePath: string, withProof: boolean): Promise<Error | null>;
}

export interface ZeroGStorageSdkTransportOptions {
  indexer: string | ZeroGStorageSdkIndexer;
  evmRpc: string;
  signer: ZeroGStorageSigner;
  withProof?: boolean;
  tempDirectory?: string;
  uploadOptions?: ZeroGStorageUploadOptions;
  retryOptions?: ZeroGStorageRetryOptions;
  transactionOptions?: ZeroGStorageTransactionOptions;
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

export function createZeroGStorageTransport(options: ZeroGStorageSdkTransportOptions): ZeroGStorageTransport {
  const indexer = typeof options.indexer === "string" ? new Indexer(options.indexer) : options.indexer;
  const tempDirectory = options.tempDirectory ?? tmpdir();

  if (!options.evmRpc.trim()) {
    throw new StorageConfigurationError("ZeroGStorageSdkTransport.evmRpc must be a non-empty RPC URL.");
  }

  return {
    async putObject(request) {
      const uploadData = new MemData(Buffer.from(request.canonical, "utf8"));
      const [result, error] = await indexer.upload(
        uploadData,
        options.evmRpc,
        options.signer,
        options.uploadOptions,
        options.retryOptions,
        options.transactionOptions
      );

      if (error) {
        throw error;
      }
      const uploadResult = toSingleUploadResult(result);
      if (!uploadResult) {
        throw new StorageConfigurationError("0G upload did not return a result.");
      }

      return {
        uri: buildZeroGStorageUri({
          namespace: request.namespace,
          hash: request.hash,
          rootHash: uploadResult.rootHash,
          txHash: uploadResult.txHash
        })
      };
    },

    async getObject(uri) {
      const { rootHash } = parseZeroGStorageUri(uri);
      const downloadDirectory = await mkdtemp(path.join(tempDirectory, "fulfillpay-0g-"));
      const targetPath = path.join(downloadDirectory, `${rootHash}.json`);

      try {
        const error = await indexer.download(rootHash, targetPath, options.withProof ?? true);

        if (error) {
          throw error;
        }

        return await readFile(targetPath, "utf8");
      } finally {
        await rm(downloadDirectory, { recursive: true, force: true });
      }
    }
  };
}

export function buildZeroGStorageUri(parts: ZeroGStorageUriParts): URI {
  const normalizedNamespace = normalizeNamespace(parts.namespace);
  assertZeroGRootHash(parts.rootHash);

  const query = new URLSearchParams({ root: parts.rootHash });

  if (parts.txHash) {
    query.set("tx", parts.txHash);
  }

  return `0g://storage/${normalizedNamespace}/${parts.hash}.json?${query.toString()}` as URI;
}

export function parseZeroGStorageUri(uri: URI): ZeroGStorageUriParts {
  if (!uri.startsWith(ZERO_G_STORAGE_PREFIX)) {
    throw new StorageConfigurationError(`ZeroGStorageAdapter received a non-0G storage URI: ${uri}`);
  }

  const [pathname, queryString = ""] = uri.slice(ZERO_G_STORAGE_PREFIX.length).split("?", 2);
  const searchParams = new URLSearchParams(queryString);
  const pathSegments = pathname.split("/").filter(Boolean);
  const fileName = pathSegments.at(-1);
  const hashMatch = fileName ? HASH_FILE_PATTERN.exec(fileName) : null;
  const rootHash = searchParams.get("root") ?? "";

  if (!hashMatch) {
    throw new StorageConfigurationError(`0G storage URI does not encode a canonical object hash: ${uri}`);
  }
  assertZeroGRootHash(rootHash);

  return {
    namespace: pathSegments.slice(0, -1).join("/") || "objects",
    hash: hashMatch[1] as Bytes32,
    rootHash,
    ...(searchParams.get("tx") ? { txHash: searchParams.get("tx") as string } : {})
  };
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

function assertZeroGRootHash(rootHash: string): void {
  if (!ROOT_HASH_PATTERN.test(rootHash)) {
    throw new StorageConfigurationError("0G storage rootHash must be a 0x-prefixed 32-byte hex string.");
  }
}

function toSingleUploadResult(
  result:
    | { txHash: string; rootHash: string; txSeq: number }
    | { txHashes: string[]; rootHashes: string[]; txSeqs: number[] }
    | null
    | undefined
): { txHash: string; rootHash: string; txSeq: number } | null {
  if (!result) {
    return null;
  }
  if ("rootHashes" in result || "txHashes" in result || "txSeqs" in result) {
    throw new StorageConfigurationError("ZeroGStorageAdapter only supports single-object uploads.");
  }

  return result;
}
