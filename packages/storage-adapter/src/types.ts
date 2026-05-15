import type { Bytes32, URI } from "@tyrpay/sdk-core";

export interface StoragePointer {
  uri: URI;
  hash: Bytes32;
}

export interface PutObjectOptions {
  namespace?: string;
}

export interface GetObjectOptions {
  expectedHash?: Bytes32;
}

export interface StorageAdapter {
  readonly kind: string;
  putObject<T>(value: T, options?: PutObjectOptions): Promise<StoragePointer>;
  getObject<T>(pointerOrUri: StoragePointer | URI, options?: GetObjectOptions): Promise<T>;
}

export class StorageIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageIntegrityError";
  }
}

export class StorageNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageNotFoundError";
  }
}

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}
