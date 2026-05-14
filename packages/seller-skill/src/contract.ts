import { Contract, type ContractRunner } from "ethers";
import { normalizeAddress, normalizeBytes32 } from "@tyrpay/sdk-core";
import { SellerSkillToolError } from "./errors.js";
import type { RawOnChainTask, ReadableContractLike } from "./types.js";
import { TYRPAY_SETTLEMENT_ABI } from "./abi.js";

const TASK_FIELD_NAMES = [
  "taskId",
  "taskNonce",
  "buyer",
  "seller",
  "token",
  "amount",
  "deadlineMs",
  "commitmentHash",
  "commitmentURI",
  "fundedAtMs",
  "proofBundleHash",
  "proofBundleURI",
  "proofSubmittedAtMs",
  "reportHash",
  "settledAtMs",
  "refundedAtMs",
  "status"
] as const;

const ZERO_HASH = "0x" + "0".repeat(64);

export function createReadableSettlementContract(address: string, runner: ContractRunner): ReadableContractLike {
  return new Contract(address, TYRPAY_SETTLEMENT_ABI, runner) as unknown as ReadableContractLike;
}

export function normalizeRawOnChainTask(value: unknown): RawOnChainTask {
  const field = createTaskFieldReader(value);

  try {
    const task: RawOnChainTask = {
      taskId: normalizeBytes32(readString(field("taskId"), "taskId"), "taskId"),
      taskNonce: normalizeBytes32(readString(field("taskNonce"), "taskNonce"), "taskNonce"),
      buyer: normalizeAddress(readString(field("buyer"), "buyer"), "buyer"),
      seller: normalizeAddress(readString(field("seller"), "seller"), "seller"),
      token: normalizeAddress(readString(field("token"), "token"), "token"),
      amount: readBigInt(field("amount"), "amount"),
      deadlineMs: readBigInt(field("deadlineMs"), "deadlineMs"),
      commitmentHash: normalizeBytes32(readString(field("commitmentHash"), "commitmentHash"), "commitmentHash"),
      commitmentURI: readString(field("commitmentURI"), "commitmentURI"),
      fundedAtMs: readBigInt(field("fundedAtMs"), "fundedAtMs"),
      proofBundleHash: normalizeBytes32(readString(field("proofBundleHash"), "proofBundleHash"), "proofBundleHash"),
      proofBundleURI: readString(field("proofBundleURI"), "proofBundleURI"),
      proofSubmittedAtMs: readBigInt(field("proofSubmittedAtMs"), "proofSubmittedAtMs"),
      reportHash: normalizeBytes32(readString(field("reportHash"), "reportHash"), "reportHash"),
      settledAtMs: readBigInt(field("settledAtMs"), "settledAtMs"),
      refundedAtMs: readBigInt(field("refundedAtMs"), "refundedAtMs"),
      status: readStatus(field("status"))
    };

    if (Number(task.status) < 0 || Number(task.status) > 5) {
      throw new TypeError(`status must be in range 0..5, received ${task.status}.`);
    }

    return task;
  } catch (error) {
    throw new SellerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message:
        "Settlement getTask() result does not match the TyrPaySettlement.Task ABI expected by seller-skill.",
      suggestion:
        "Use createReadableSettlementContract() or TYRPAY_SETTLEMENT_ABI from @tyrpay/seller-skill, and do not spread ethers Contract instances.",
      retryable: false,
      causeName: error instanceof Error ? error.name : undefined
    });
  }
}

function createTaskFieldReader(value: unknown): (fieldName: (typeof TASK_FIELD_NAMES)[number]) => unknown {
  if (value === null || typeof value !== "object") {
    throw new SellerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message: "Settlement getTask() did not return an object or tuple.",
      suggestion: "Check that the settlement contract ABI uses the tuple getTask() return format.",
      retryable: false
    });
  }

  const record = value as Record<string, unknown>;
  const tuple = Array.isArray(value) ? value as unknown[] : isArrayLike(value) ? Array.from(value as ArrayLike<unknown>) : null;

  return (fieldName) => {
    if (record[fieldName] !== undefined) {
      return record[fieldName];
    }

    const index = TASK_FIELD_NAMES.indexOf(fieldName);
    if (tuple && tuple.length >= TASK_FIELD_NAMES.length) {
      return tuple[index];
    }

    throw new TypeError(`getTask() result is missing ${fieldName}.`);
  };
}

function isArrayLike(value: object): value is ArrayLike<unknown> {
  const length = (value as { length?: unknown }).length;
  return typeof length === "number" && Number.isSafeInteger(length) && length >= TASK_FIELD_NAMES.length;
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${fieldName} must be a string.`);
  }

  return value;
}

function readBigInt(value: unknown, fieldName: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return BigInt(value);
  }

  throw new TypeError(`${fieldName} must be a non-negative uint value.`);
}

function readStatus(value: unknown): number | bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }

  throw new TypeError("status must be a uint value.");
}

export function isEmptyBytes32(value: string): boolean {
  return value === ZERO_HASH;
}
