import { normalizeAddress, normalizeBytes32, normalizeUIntString } from "@tyrpay/sdk-core";
import type { CommitmentExpectations } from "@tyrpay/buyer-sdk";
import type {
  CheckTaskInput,
  FundTaskInput,
  ListTasksInput,
  PostTaskInput,
  RefundTaskInput
} from "./types.js";
import { validationError } from "./errors.js";

const POST_TASK_KEYS = new Set([
  "seller",
  "token",
  "amount",
  "deadline",
  "metadataHash",
  "metadataURI",
  "expectations",
  "pollIntervalMs",
  "timeoutMs",
  "createOnly"
]);
const EXPECTATION_KEYS = new Set([
  "acceptedHosts",
  "acceptedPaths",
  "acceptedMethods",
  "acceptedModels",
  "expectedVerifier",
  "minTotalTokens",
  "requireNonZeroMinUsage",
  "nowMs"
]);
const FUND_TASK_KEYS = new Set(["taskId", "expectations"]);
const CHECK_TASK_KEYS = new Set(["taskId"]);
const REFUND_TASK_KEYS = new Set(["taskId", "reason"]);
const LIST_TASK_KEYS = new Set(["taskIds"]);

export function validatePostTaskInput(input: unknown): PostTaskInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, POST_TASK_KEYS, "input");

  const createOnly = object.createOnly !== undefined ? expectBoolean(object.createOnly, "createOnly") : false;

  if (!createOnly && object.expectations === undefined) {
    throw validationError(
      "expectations is required when createOnly is not true. " +
        "Pass expectations to validate the seller's commitment before funding, or set createOnly=true to create without funding.",
      "expectations",
      object.expectations
    );
  }

  const expectations = object.expectations === undefined ? undefined : validateExpectations(object.expectations, "expectations");

  return {
    seller: normalizeAddressField(expectString(object.seller, "seller"), "seller"),
    token: normalizeAddressField(expectString(object.token, "token"), "token"),
    amount: normalizeUIntField(expectString(object.amount, "amount"), "amount"),
    deadline: normalizeUIntField(expectString(object.deadline, "deadline"), "deadline"),
    ...(object.metadataHash !== undefined
      ? { metadataHash: normalizeBytes32Field(expectString(object.metadataHash, "metadataHash"), "metadataHash") }
      : {}),
    ...(object.metadataURI !== undefined ? { metadataURI: expectString(object.metadataURI, "metadataURI") } : {}),
    ...(expectations ? { expectations } : {}),
    ...(object.pollIntervalMs !== undefined ? { pollIntervalMs: expectPositiveInteger(object.pollIntervalMs, "pollIntervalMs") } : {}),
    ...(object.timeoutMs !== undefined ? { timeoutMs: expectPositiveInteger(object.timeoutMs, "timeoutMs") } : {}),
    ...(createOnly ? { createOnly } : {})
  };
}

export function validateFundTaskInput(input: unknown): FundTaskInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, FUND_TASK_KEYS, "input");

  if (object.expectations === undefined) {
    throw validationError(
      "expectations is required. Pass expectations to validate the seller's commitment before locking payment.",
      "expectations",
      object.expectations
    );
  }

  return {
    taskId: normalizeBytes32Field(expectString(object.taskId, "taskId"), "taskId"),
    expectations: validateExpectations(object.expectations, "expectations")
  };
}

export function validateCheckTaskInput(input: unknown): CheckTaskInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, CHECK_TASK_KEYS, "input");

  return {
    taskId: normalizeBytes32Field(expectString(object.taskId, "taskId"), "taskId")
  };
}

export function validateRefundTaskInput(input: unknown): RefundTaskInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, REFUND_TASK_KEYS, "input");
  const reason = expectString(object.reason, "reason");

  if (reason !== "proof_submission_deadline" && reason !== "verification_timeout") {
    throw validationError("Expected reason to be 'proof_submission_deadline' or 'verification_timeout'.", "reason", object.reason);
  }

  return {
    taskId: normalizeBytes32Field(expectString(object.taskId, "taskId"), "taskId"),
    reason
  };
}

export function validateListTasksInput(input: unknown): ListTasksInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, LIST_TASK_KEYS, "input");

  if (!Array.isArray(object.taskIds)) {
    throw validationError("Expected taskIds to be an array of bytes32 task IDs.", "taskIds", object.taskIds);
  }

  if (object.taskIds.length < 1 || object.taskIds.length > 20) {
    throw validationError("Expected taskIds to contain between 1 and 20 items.", "taskIds", object.taskIds);
  }

  return {
    taskIds: object.taskIds.map((value, index) => normalizeBytes32Field(expectString(value, `taskIds[${index}]`), `taskIds[${index}]`))
  };
}

function validateExpectations(input: unknown, fieldName: string): CommitmentExpectations {
  const object = expectObject(input, fieldName);
  assertNoAdditionalProperties(object, EXPECTATION_KEYS, fieldName);

  return {
    ...(object.acceptedHosts !== undefined ? { acceptedHosts: expectStringArray(object.acceptedHosts, `${fieldName}.acceptedHosts`) } : {}),
    ...(object.acceptedPaths !== undefined ? { acceptedPaths: expectStringArray(object.acceptedPaths, `${fieldName}.acceptedPaths`) } : {}),
    ...(object.acceptedMethods !== undefined
      ? {
          acceptedMethods: expectStringArray(object.acceptedMethods, `${fieldName}.acceptedMethods`).map((value) => value.toUpperCase())
        }
      : {}),
    ...(object.acceptedModels !== undefined ? { acceptedModels: expectStringArray(object.acceptedModels, `${fieldName}.acceptedModels`) } : {}),
    ...(object.expectedVerifier !== undefined
      ? { expectedVerifier: normalizeAddressField(expectString(object.expectedVerifier, `${fieldName}.expectedVerifier`), `${fieldName}.expectedVerifier`) }
      : {}),
    ...(object.minTotalTokens !== undefined ? { minTotalTokens: expectNonNegativeNumber(object.minTotalTokens, `${fieldName}.minTotalTokens`) } : {}),
    ...(object.requireNonZeroMinUsage !== undefined
      ? { requireNonZeroMinUsage: expectBoolean(object.requireNonZeroMinUsage, `${fieldName}.requireNonZeroMinUsage`) }
      : {}),
    ...(object.nowMs !== undefined
      ? { nowMs: normalizeUIntField(expectString(object.nowMs, `${fieldName}.nowMs`), `${fieldName}.nowMs`) }
      : {})
  };
}

function normalizeAddressField(value: string, fieldName: string): string {
  try {
    return normalizeAddress(value, fieldName);
  } catch (error) {
    throw validationError((error as Error).message, fieldName, value);
  }
}

function normalizeBytes32Field(value: string, fieldName: string): string {
  try {
    return normalizeBytes32(value, fieldName);
  } catch (error) {
    throw validationError((error as Error).message, fieldName, value);
  }
}

function normalizeUIntField(value: string, fieldName: string): string {
  try {
    return normalizeUIntString(value, fieldName);
  } catch (error) {
    throw validationError((error as Error).message, fieldName, value);
  }
}

function expectObject(input: unknown, fieldName: string): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("Expected a plain object.", fieldName, input);
  }

  return input as Record<string, unknown>;
}

function expectString(input: unknown, fieldName: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw validationError("Expected a non-empty string.", fieldName, input);
  }

  return input;
}

function expectStringArray(input: unknown, fieldName: string): string[] {
  if (!Array.isArray(input)) {
    throw validationError("Expected an array of strings.", fieldName, input);
  }

  return input.map((value, index) => expectString(value, `${fieldName}[${index}]`));
}

function expectPositiveInteger(input: unknown, fieldName: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input <= 0) {
    throw validationError("Expected a positive integer.", fieldName, input);
  }

  return input;
}

function expectNonNegativeNumber(input: unknown, fieldName: string): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    throw validationError("Expected a non-negative number.", fieldName, input);
  }

  return input;
}

function expectBoolean(input: unknown, fieldName: string): boolean {
  if (typeof input !== "boolean") {
    throw validationError("Expected a boolean.", fieldName, input);
  }

  return input;
}

function assertNoAdditionalProperties(object: Record<string, unknown>, allowedKeys: Set<string>, fieldName: string): void {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw validationError(`Unexpected field '${key}'.`, `${fieldName}.${key}`, object[key]);
    }
  }
}
