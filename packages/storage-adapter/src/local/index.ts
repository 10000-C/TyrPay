import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { URI } from "@tyrpay/sdk-core";

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

export interface LocalStorageAdapterOptions {
  baseDirectory: string;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = "local";

  constructor(private readonly options: LocalStorageAdapterOptions) {
    if (!options.baseDirectory.trim()) {
      throw new StorageConfigurationError("LocalStorageAdapter.baseDirectory must be a non-empty path.");
    }
  }

  async putObject<T>(value: T, options: PutObjectOptions = {}): Promise<StoragePointer> {
    const prepared = prepareStoredObject(value);
    const targetPath = this.resolveStoragePath(options.namespace ?? "objects", prepared.hash);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, prepared.canonical, "utf8");

    return {
      uri: pathToFileURL(targetPath).href as URI,
      hash: prepared.hash
    };
  }

  async getObject<T>(pointerOrUri: StoragePointer | URI, options: GetObjectOptions = {}): Promise<T> {
    const uri = toUri(pointerOrUri);
    const filePath = this.resolveFilePath(uri);
    const expectedHash = resolveExpectedHash(pointerOrUri, options);

    let payloadText: string;

    try {
      payloadText = await readFile(filePath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new StorageNotFoundError(`Stored object not found: ${uri}`);
      }

      throw error;
    }

    const payload = parseStoredJson<T>(payloadText, `Stored object at ${uri} is not valid JSON.`);

    assertStoredHash(payload, expectedHash, uri);
    return payload;
  }

  private resolveStoragePath(namespace: string, hash: StoragePointer["hash"]): string {
    const normalizedNamespace = normalizeNamespace(namespace);
    const absoluteBaseDirectory = path.resolve(this.options.baseDirectory);
    const targetPath = path.resolve(absoluteBaseDirectory, normalizedNamespace, `${hash}.json`);

    if (!isWithinBaseDirectory(absoluteBaseDirectory, targetPath)) {
      throw new StorageConfigurationError(`Resolved storage path escapes the configured base directory: ${targetPath}`);
    }

    return targetPath;
  }

  private resolveFilePath(uri: URI): string {
    let filePath: string;

    try {
      filePath = fileURLToPath(uri);
    } catch (error) {
      throw new StorageConfigurationError(`LocalStorageAdapter received a non-file URI: ${uri}. ${toErrorMessage(error)}`);
    }

    const absoluteBaseDirectory = path.resolve(this.options.baseDirectory);
    const absoluteFilePath = path.resolve(filePath);

    if (!isWithinBaseDirectory(absoluteBaseDirectory, absoluteFilePath)) {
      throw new StorageConfigurationError(`URI resolves outside the configured base directory: ${uri}`);
    }

    return absoluteFilePath;
  }
}

function isWithinBaseDirectory(baseDirectory: string, targetPath: string): boolean {
  const relativePath = path.relative(baseDirectory, targetPath);
  return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
