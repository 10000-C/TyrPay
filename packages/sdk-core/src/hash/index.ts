import { keccak256, toUtf8Bytes } from "ethers";

import { canonicalize } from "../canonicalize/index.js";
import {
  assertCallIntent,
  assertDeliveryReceipt,
  assertExecutionCommitment,
  assertProofBundle,
  assertProtocolObject,
  assertTaskContext,
  assertTaskIntent,
  assertUnsignedVerificationReport,
  buildCallIntent,
  buildTaskContext,
  type BuildCallIntentInput,
  type BuildTaskContextInput,
  type Bytes32,
  type CallIntent,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type ProofBundle,
  type TaskContext,
  type TaskIntent,
  type UnsignedVerificationReport,
  type VerificationReport
} from "../types/index.js";

export interface HashObjectOptions {
  excludeTopLevelKeys?: string[];
}

export interface BuildCallIntentHashInput extends Omit<BuildCallIntentInput, "taskContextHash"> {
  taskContext: TaskContext | BuildTaskContextInput;
}

export function hashObject(input: unknown, options: HashObjectOptions = {}): Bytes32 {
  const normalized = omitTopLevelKeys(input, options.excludeTopLevelKeys);

  if (isProtocolSchemaObject(normalized)) {
    assertProtocolObject(normalized);
  }

  return keccak256(toUtf8Bytes(canonicalize(normalized))) as Bytes32;
}

export function hashTaskIntent(input: TaskIntent): Bytes32 {
  assertTaskIntent(input);
  return hashObject(input);
}

export function hashTaskContext(input: TaskContext): Bytes32 {
  assertTaskContext(input);
  return hashObject(input);
}

export function buildTaskContextHash(input: BuildTaskContextInput): Bytes32 {
  return hashTaskContext(buildTaskContext(input));
}

export function hashExecutionCommitment(input: ExecutionCommitment): Bytes32 {
  assertExecutionCommitment(input);
  return hashObject(input);
}

export function hashCallIntent(input: CallIntent): Bytes32 {
  assertCallIntent(input);
  return hashObject(input);
}

export function buildCallIntentHash(input: BuildCallIntentHashInput): Bytes32 {
  const taskContext = isTaskContext(input.taskContext) ? input.taskContext : buildTaskContext(input.taskContext);

  return hashCallIntent(
    buildCallIntent({
      taskContextHash: hashTaskContext(taskContext),
      callIndex: input.callIndex,
      host: input.host,
      path: input.path,
      method: input.method,
      declaredModel: input.declaredModel,
      requestBodyHash: input.requestBodyHash
    })
  );
}

export function hashDeliveryReceipt(input: DeliveryReceipt): Bytes32 {
  assertDeliveryReceipt(input);
  return hashObject(input);
}

export function hashProofBundle(input: ProofBundle): Bytes32 {
  assertProofBundle(input);
  return hashObject(input);
}

export function hashVerificationReport(input: UnsignedVerificationReport | VerificationReport): Bytes32 {
  const unsignedReport = toUnsignedVerificationReport(input);
  assertUnsignedVerificationReport(unsignedReport);
  return hashObject(unsignedReport, { excludeTopLevelKeys: ["reportHash", "signature"] });
}

function omitTopLevelKeys(input: unknown, excludedKeys: string[] | undefined): unknown {
  if (!excludedKeys || excludedKeys.length === 0 || !isPlainObject(input)) {
    return input;
  }

  const omitted = new Set(excludedKeys);

  return Object.fromEntries(Object.entries(input).filter(([key]) => !omitted.has(key)));
}

function isTaskContext(value: TaskContext | BuildTaskContextInput): value is TaskContext {
  return isProtocolSchemaObject(value);
}

function toUnsignedVerificationReport(
  report: UnsignedVerificationReport | VerificationReport
): UnsignedVerificationReport {
  const { signature: _signature, ...unsignedReport } = report;
  return unsignedReport;
}

function isProtocolSchemaObject(value: unknown): value is { schemaVersion: string } {
  return isPlainObject(value) && typeof value.schemaVersion === "string" && value.schemaVersion.startsWith("TyrPay.");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
