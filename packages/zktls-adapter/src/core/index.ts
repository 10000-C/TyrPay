import {
  assertTaskContext,
  hashObject,
  normalizeBytes32,
  normalizeUIntString,
  type Bytes32,
  type DeliveryReceipt,
  type ExtractedReceiptFields,
  type TaskContext,
  type UIntLike,
  type URI,
  type UnixMillis
} from "@fulfillpay/sdk-core";

export interface ZkTlsRequestEvidence {
  host: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ZkTlsResponseEvidence {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

export interface ProviderProofContext {
  protocol: TaskContext["protocol"];
  version: TaskContext["version"];
  chainId: TaskContext["chainId"];
  settlementContract: TaskContext["settlementContract"];
  taskId: TaskContext["taskId"];
  taskNonce: TaskContext["taskNonce"];
  commitmentHash: TaskContext["commitmentHash"];
  buyer: TaskContext["buyer"];
  seller: TaskContext["seller"];
  callIndex: number;
  callIntentHash: Bytes32;
}

export interface ZkTlsReceiptContext {
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: Bytes32;
  rawProofURI: URI;
}

export interface BuildProviderProofContextInput {
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: string;
}

export interface ProvenFetchResult<TRawProof = unknown, TResponse = unknown> {
  response: TResponse;
  rawProof: TRawProof;
  extracted: ExtractedReceiptFields;
}

export interface ZkTlsAdapter<TRawProof = unknown, TInput = unknown, TResponse = unknown> {
  readonly name: string;
  provenFetch(input: TInput): Promise<ProvenFetchResult<TRawProof, TResponse>>;
  verifyRawProof(rawProof: TRawProof): Promise<boolean>;
  normalizeReceipt(rawProof: TRawProof, context: ZkTlsReceiptContext): Promise<DeliveryReceipt>;
}

export function buildProviderProofContext(input: BuildProviderProofContextInput): ProviderProofContext {
  assertTaskContext(input.taskContext);
  assertSafeInteger(input.callIndex, "callIndex", { min: 0 });

  return {
    protocol: input.taskContext.protocol,
    version: input.taskContext.version,
    chainId: input.taskContext.chainId,
    settlementContract: input.taskContext.settlementContract,
    taskId: input.taskContext.taskId,
    taskNonce: input.taskContext.taskNonce,
    commitmentHash: input.taskContext.commitmentHash,
    buyer: input.taskContext.buyer,
    seller: input.taskContext.seller,
    callIndex: input.callIndex,
    callIntentHash: normalizeBytes32(input.callIntentHash, "callIntentHash")
  };
}

export function hashRequestEvidence(input: ZkTlsRequestEvidence): Bytes32 {
  return hashObject(normalizeRequestEvidence(input));
}

export function hashResponseEvidence(input: ZkTlsResponseEvidence): Bytes32 {
  return hashObject(normalizeResponseEvidence(input));
}

export function toUnixMillisString(value: UIntLike, fieldName = "unixMillis"): UnixMillis {
  return normalizeUIntString(value, fieldName) as UnixMillis;
}

export function assertReceiptContextMatchesProofContext(
  proofContext: ProviderProofContext,
  receiptContext: ZkTlsReceiptContext
): void {
  const expected = buildProviderProofContext(receiptContext);

  for (const key of Object.keys(expected) as Array<keyof ProviderProofContext>) {
    if (proofContext[key] !== expected[key]) {
      throw new TypeError(`Proof context mismatch for ${String(key)}.`);
    }
  }
}

export function normalizeRequestEvidence(input: ZkTlsRequestEvidence): ZkTlsRequestEvidence {
  assertString(input.host, "request.host");
  assertString(input.path, "request.path");
  assertString(input.method, "request.method");

  return {
    host: input.host,
    path: input.path,
    method: input.method.toUpperCase(),
    ...(input.headers ? { headers: normalizeHeaders(input.headers, "request.headers") } : {}),
    ...(input.body !== undefined ? { body: input.body } : {})
  };
}

export function normalizeResponseEvidence(input: ZkTlsResponseEvidence): ZkTlsResponseEvidence {
  assertSafeInteger(input.status, "response.status", { min: 100, max: 599 });

  return {
    status: input.status,
    ...(input.headers ? { headers: normalizeHeaders(input.headers, "response.headers") } : {}),
    body: input.body
  };
}

function normalizeHeaders(headers: Record<string, string>, fieldName: string): Record<string, string> {
  const normalizedEntries = Object.entries(headers).map(([key, value]) => {
    assertString(key, `${fieldName} key`);
    assertString(value, `${fieldName}.${key}`);

    return [key.toLowerCase(), value] as const;
  });

  normalizedEntries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return Object.fromEntries(normalizedEntries);
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
}

function assertSafeInteger(
  value: unknown,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
  } = {}
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${fieldName} must be a safe integer.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new TypeError(`${fieldName} must be >= ${options.min}.`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new TypeError(`${fieldName} must be <= ${options.max}.`);
  }
}
