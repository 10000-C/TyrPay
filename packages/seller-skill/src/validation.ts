import { normalizeAddress, normalizeBytes32, normalizeUIntString } from "@tyrpay/sdk-core";
import { validationError } from "./errors.js";
import type {
  AcceptTaskInput,
  CheckSettlementInput,
  ExecuteTaskInput,
  SubmitProofInput
} from "./types.js";

const ACCEPT_TASK_KEYS = new Set([
  "taskId",
  "host",
  "path",
  "method",
  "allowedModels",
  "minTotalTokens",
  "deadline"
]);

const EXECUTE_TASK_KEYS = new Set([
  "commitment",
  "taskNonce",
  "callIndex",
  "request",
  "declaredModel",
  "providerOptions",
  "provider"
]);

const REQUEST_KEYS = new Set(["host", "path", "method", "headers", "body"]);

const SUBMIT_PROOF_KEYS = new Set(["commitment", "receipts"]);

const CHECK_SETTLEMENT_KEYS = new Set(["taskId"]);

export function validateAcceptTaskInput(input: unknown): AcceptTaskInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, ACCEPT_TASK_KEYS, "input");

  return {
    taskId: normalizeBytes32Field(expectString(object.taskId, "taskId"), "taskId"),
    host: expectString(object.host, "host"),
    path: expectString(object.path, "path"),
    method: expectString(object.method, "method"),
    allowedModels: expectStringArray(object.allowedModels, "allowedModels"),
    minTotalTokens: expectPositiveNumber(object.minTotalTokens, "minTotalTokens"),
    deadline: normalizeUIntField(expectString(object.deadline, "deadline"), "deadline")
  };
}

export function validateExecuteTaskInput(input: unknown): ExecuteTaskInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, EXECUTE_TASK_KEYS, "input");

  return {
    commitment: expectObject(object.commitment, "commitment"),
    taskNonce: normalizeBytes32Field(expectString(object.taskNonce, "taskNonce"), "taskNonce"),
    callIndex: expectNonNegativeInteger(object.callIndex, "callIndex"),
    request: validateRequest(object.request, "request"),
    declaredModel: expectString(object.declaredModel, "declaredModel"),
    ...(object.providerOptions !== undefined ? { providerOptions: expectObject(object.providerOptions, "providerOptions") as Record<string, unknown> } : {}),
    ...(object.provider !== undefined ? { provider: expectString(object.provider, "provider") } : {})
  };
}

export function validateSubmitProofInput(input: unknown): SubmitProofInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, SUBMIT_PROOF_KEYS, "input");

  if (!Array.isArray(object.receipts) || object.receipts.length === 0) {
    throw validationError("Expected a non-empty array of receipt objects.", "receipts", object.receipts);
  }

  return {
    commitment: expectObject(object.commitment, "commitment"),
    receipts: object.receipts
  };
}

export function validateCheckSettlementInput(input: unknown): CheckSettlementInput {
  const object = expectObject(input, "input");
  assertNoAdditionalProperties(object, CHECK_SETTLEMENT_KEYS, "input");

  return {
    taskId: normalizeBytes32Field(expectString(object.taskId, "taskId"), "taskId")
  };
}

function validateRequest(input: unknown, fieldName: string): ExecuteTaskInput["request"] {
  const object = expectObject(input, fieldName);
  assertNoAdditionalProperties(object, REQUEST_KEYS, fieldName);

  const headers = object.headers !== undefined
    ? expectRecordStringString(object.headers, `${fieldName}.headers`)
    : undefined;

  return {
    host: expectString(object.host, `${fieldName}.host`),
    path: expectString(object.path, `${fieldName}.path`),
    method: expectString(object.method, `${fieldName}.method`),
    ...(headers ? { headers } : {}),
    ...(object.body !== undefined ? { body: object.body } : {})
  };
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

  if (input.length === 0) {
    throw validationError("Expected a non-empty array.", fieldName, input);
  }

  return input.map((value, index) => expectString(value, `${fieldName}[${index}]`));
}

function expectPositiveNumber(input: unknown, fieldName: string): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    throw validationError("Expected a positive number.", fieldName, input);
  }

  return input;
}

function expectNonNegativeInteger(input: unknown, fieldName: string): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) {
    throw validationError("Expected a non-negative integer.", fieldName, input);
  }

  return input;
}

function expectRecordStringString(input: unknown, fieldName: string): Record<string, string> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("Expected an object with string values.", fieldName, input);
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw validationError("Expected string values.", `${fieldName}.${key}`, value);
    }
    result[key] = value;
  }

  return result;
}

function assertNoAdditionalProperties(object: Record<string, unknown>, allowedKeys: Set<string>, fieldName: string): void {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw validationError(`Unexpected field '${key}'.`, `${fieldName}.${key}`, object[key]);
    }
  }
}
