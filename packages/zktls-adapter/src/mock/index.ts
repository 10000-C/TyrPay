import {
  SCHEMA_VERSIONS,
  assertTaskContext,
  hashObject,
  normalizeBytes32,
  type Bytes32,
  type DeliveryReceipt,
  type ExtractedReceiptFields,
  type TaskContext,
  type UIntLike,
  type UnixMillis
} from "@fulfillpay/sdk-core";

import {
  assertReceiptContextMatchesProofContext,
  buildProviderProofContext,
  hashRequestEvidence,
  hashResponseEvidence,
  normalizeRequestEvidence,
  normalizeResponseEvidence,
  toUnixMillisString,
  type ProviderProofContext,
  type ProvenFetchResult,
  type ZkTlsAdapter,
  type ZkTlsReceiptContext,
  type ZkTlsRequestEvidence,
  type ZkTlsResponseEvidence
} from "../core/index.js";

export const MOCK_ZKTLS_PROVIDER = "mock" as const;
export const MOCK_RAW_PROOF_SCHEMA_VERSION = "fulfillpay.mock-zktls-proof.v1" as const;
export const DEFAULT_MOCK_OBSERVED_AT = "1735686000000" as const;
const DEFAULT_TOTAL_TOKENS = 128;

export type MockScenario =
  | "pass"
  | "model_mismatch"
  | "usage_insufficient"
  | "timestamp_before_funded"
  | "timestamp_after_deadline"
  | "timestamp_invalid";

export interface MockTimeWindow {
  fundedAt?: UIntLike;
  deadline?: UIntLike;
}

export interface MockProvenFetchInput {
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: Bytes32;
  request: ZkTlsRequestEvidence;
  declaredModel: string;
  scenario?: MockScenario;
  observedModel?: string;
  totalTokens?: number;
  commitmentMinTokens?: number;
  observedAt?: UIntLike;
  timeWindow?: MockTimeWindow;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  providerProofId?: string;
}

export interface MockRawProofPayload {
  proofSchemaVersion: typeof MOCK_RAW_PROOF_SCHEMA_VERSION;
  provider: typeof MOCK_ZKTLS_PROVIDER;
  providerProofId: string;
  scenario: MockScenario;
  proofContext: ProviderProofContext;
  request: ZkTlsRequestEvidence;
  response: ZkTlsResponseEvidence;
  observedAt: UnixMillis;
  extracted: ExtractedReceiptFields;
}

export interface MockRawProof extends MockRawProofPayload {
  proofHash: Bytes32;
}

export class MockZkTlsAdapter
  implements ZkTlsAdapter<MockRawProof, MockProvenFetchInput, ZkTlsResponseEvidence["body"]>
{
  readonly name = MOCK_ZKTLS_PROVIDER;

  async provenFetch(input: MockProvenFetchInput): Promise<ProvenFetchResult<MockRawProof, ZkTlsResponseEvidence["body"]>> {
    const request = normalizeRequestEvidence(input.request);
    const proofContext = buildProviderProofContext({
      taskContext: input.taskContext,
      callIndex: input.callIndex,
      callIntentHash: input.callIntentHash
    });
    const scenario = input.scenario ?? "pass";
    const observedAt = resolveObservedAt(input, scenario);
    const extracted = buildExtractedFields(input, scenario);
    const response = normalizeResponseEvidence({
      status: input.responseStatus ?? 200,
      ...(input.responseHeaders ? { headers: input.responseHeaders } : {}),
      body:
        input.responseBody ??
        buildDefaultResponseBody({
          model: extracted.model,
          totalTokens: extracted.usage.totalTokens,
          observedAt
        })
    });
    const providerProofId =
      input.providerProofId ??
      deriveProviderProofId({
        proofSchemaVersion: MOCK_RAW_PROOF_SCHEMA_VERSION,
        provider: MOCK_ZKTLS_PROVIDER,
        scenario,
        proofContext,
        request,
        response,
        observedAt,
        extracted
      });

    const payload: MockRawProofPayload = {
      proofSchemaVersion: MOCK_RAW_PROOF_SCHEMA_VERSION,
      provider: MOCK_ZKTLS_PROVIDER,
      providerProofId,
      scenario,
      proofContext,
      request,
      response,
      observedAt,
      extracted
    };

    const rawProof: MockRawProof = {
      ...payload,
      proofHash: hashMockRawProofPayload(payload)
    };

    return {
      response: rawProof.response.body,
      rawProof,
      extracted: rawProof.extracted
    };
  }

  async verifyRawProof(rawProof: MockRawProof): Promise<boolean> {
    try {
      assertMockRawProof(rawProof);
      return hashMockRawProofPayload(toMockRawProofPayload(rawProof)) === rawProof.proofHash;
    } catch {
      return false;
    }
  }

  async normalizeReceipt(rawProof: MockRawProof, context: ZkTlsReceiptContext): Promise<DeliveryReceipt> {
    if (!(await this.verifyRawProof(rawProof))) {
      throw new TypeError("Mock raw proof failed verification.");
    }

    assertReceiptContextMatchesProofContext(rawProof.proofContext, context);
    assertString(context.rawProofURI, "rawProofURI");
    const normalizedCallIntentHash = normalizeBytes32(context.callIntentHash, "callIntentHash");

    return {
      schemaVersion: SCHEMA_VERSIONS.deliveryReceipt,
      taskContext: context.taskContext,
      callIndex: context.callIndex,
      callIntentHash: normalizedCallIntentHash,
      provider: rawProof.provider,
      providerProofId: rawProof.providerProofId,
      requestHash: hashRequestEvidence(rawProof.request),
      responseHash: hashResponseEvidence(rawProof.response),
      observedAt: rawProof.observedAt,
      extracted: rawProof.extracted,
      rawProofHash: hashMockRawProof(rawProof),
      rawProofURI: context.rawProofURI
    };
  }
}

export const mockZkTlsAdapter = new MockZkTlsAdapter();

export function hashMockRawProofPayload(payload: MockRawProofPayload): Bytes32 {
  assertMockRawProofPayload(payload);
  return hashObject(payload);
}

export function hashMockRawProof(rawProof: MockRawProof): Bytes32 {
  assertMockRawProof(rawProof);
  return hashObject(rawProof);
}

export function toMockRawProofPayload(rawProof: MockRawProof): MockRawProofPayload {
  const { proofHash: _proofHash, ...payload } = rawProof;
  return payload;
}

function deriveProviderProofId(payload: Omit<MockRawProofPayload, "providerProofId">): string {
  return `mock-proof-${hashObject(payload).slice(2, 14)}`;
}

function buildExtractedFields(input: MockProvenFetchInput, scenario: MockScenario): ExtractedReceiptFields {
  const baseModel = input.observedModel ?? input.declaredModel;
  const baseTokens = input.totalTokens ?? DEFAULT_TOTAL_TOKENS;

  switch (scenario) {
    case "model_mismatch":
      return {
        model: input.observedModel ?? `${input.declaredModel}-mismatch`,
        usage: {
          totalTokens: baseTokens
        }
      };
    case "usage_insufficient": {
      const minTokens = input.commitmentMinTokens ?? baseTokens;
      return {
        model: baseModel,
        usage: {
          totalTokens: Math.max(0, minTokens - 1)
        }
      };
    }
    default:
      return {
        model: baseModel,
        usage: {
          totalTokens: baseTokens
        }
      };
  }
}

function resolveObservedAt(input: MockProvenFetchInput, scenario: MockScenario): UnixMillis {
  if (input.observedAt !== undefined) {
    return toUnixMillisString(input.observedAt, "observedAt");
  }

  switch (scenario) {
    case "timestamp_before_funded": {
      const fundedAt = requireTimeWindow(input.timeWindow?.fundedAt, "timeWindow.fundedAt");
      return shiftUnixMillis(fundedAt, -1n, "timeWindow.fundedAt");
    }
    case "timestamp_after_deadline": {
      const deadline = requireTimeWindow(input.timeWindow?.deadline, "timeWindow.deadline");
      return shiftUnixMillis(deadline, 1n, "timeWindow.deadline");
    }
    case "timestamp_invalid": {
      if (input.timeWindow?.fundedAt !== undefined) {
        const fundedAt = requireTimeWindow(input.timeWindow.fundedAt, "timeWindow.fundedAt");
        return shiftUnixMillis(fundedAt, -1n, "timeWindow.fundedAt");
      }

      if (input.timeWindow?.deadline !== undefined) {
        const deadline = requireTimeWindow(input.timeWindow.deadline, "timeWindow.deadline");
        return shiftUnixMillis(deadline, 1n, "timeWindow.deadline");
      }

      throw new TypeError("timestamp_invalid scenario requires timeWindow.fundedAt or timeWindow.deadline.");
    }
    default:
      return DEFAULT_MOCK_OBSERVED_AT;
  }
}

function buildDefaultResponseBody(input: {
  model: string;
  totalTokens: number;
  observedAt: UnixMillis;
}): Record<string, unknown> {
  return {
    id: "mock-chatcmpl",
    object: "chat.completion",
    created: Number(BigInt(input.observedAt) / 1000n),
    model: input.model,
    usage: {
      total_tokens: input.totalTokens
    },
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "mock completion"
        }
      }
    ]
  };
}

function requireTimeWindow(value: UIntLike | undefined, fieldName: string): UnixMillis {
  if (value === undefined) {
    throw new TypeError(`${fieldName} is required for this mock scenario.`);
  }

  return toUnixMillisString(value, fieldName);
}

function shiftUnixMillis(value: UnixMillis, delta: bigint, fieldName: string): UnixMillis {
  const shifted = BigInt(value) + delta;

  if (shifted < 0n) {
    throw new TypeError(`${fieldName} cannot be shifted below zero.`);
  }

  return shifted.toString() as UnixMillis;
}

function assertMockRawProof(rawProof: MockRawProof): void {
  assertMockRawProofPayload(rawProof);
  assertBytes32(rawProof.proofHash, "proofHash");
}

function assertMockRawProofPayload(payload: MockRawProofPayload): void {
  if (payload.proofSchemaVersion !== MOCK_RAW_PROOF_SCHEMA_VERSION) {
    throw new TypeError("proofSchemaVersion must be fulfillpay.mock-zktls-proof.v1.");
  }

  if (payload.provider !== MOCK_ZKTLS_PROVIDER) {
    throw new TypeError("provider must be mock.");
  }

  assertString(payload.providerProofId, "providerProofId");
  assertMockScenario(payload.scenario);
  assertProviderProofContext(payload.proofContext);
  normalizeRequestEvidence(payload.request);
  normalizeResponseEvidence(payload.response);
  toUnixMillisString(payload.observedAt, "observedAt");
  assertExtractedFields(payload.extracted);
}

function assertProviderProofContext(proofContext: ProviderProofContext): void {
  const taskContext: TaskContext = {
    schemaVersion: SCHEMA_VERSIONS.taskContext,
    protocol: proofContext.protocol,
    version: proofContext.version,
    chainId: proofContext.chainId,
    settlementContract: proofContext.settlementContract,
    taskId: proofContext.taskId,
    taskNonce: proofContext.taskNonce,
    commitmentHash: proofContext.commitmentHash,
    buyer: proofContext.buyer,
    seller: proofContext.seller
  };

  assertTaskContext(taskContext);
  assertSafeInteger(proofContext.callIndex, "proofContext.callIndex");
  assertBytes32(proofContext.callIntentHash, "proofContext.callIntentHash");
}

function assertMockScenario(value: string): void {
  const supportedScenarios: MockScenario[] = [
    "pass",
    "model_mismatch",
    "usage_insufficient",
    "timestamp_before_funded",
    "timestamp_after_deadline",
    "timestamp_invalid"
  ];

  if (!supportedScenarios.includes(value as MockScenario)) {
    throw new TypeError(`Unsupported mock scenario: ${value}.`);
  }
}

function assertExtractedFields(extracted: ExtractedReceiptFields): void {
  assertString(extracted.model, "extracted.model");
  assertSafeInteger(extracted.usage.totalTokens, "extracted.usage.totalTokens");
}

function assertBytes32(value: string, fieldName: string): void {
  normalizeBytes32(value, fieldName);
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
}

function assertSafeInteger(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative safe integer.`);
  }
}
