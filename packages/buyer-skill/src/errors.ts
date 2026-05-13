import { BuyerSdkConfigurationError, BuyerSdkValidationError } from "@tyrpay/buyer-sdk";
import type { BuyerSkillErrorCode, BuyerSkillErrorShape } from "./types.js";

export class BuyerSkillToolError extends Error implements BuyerSkillErrorShape {
  readonly code: BuyerSkillErrorCode;
  readonly field?: string;
  readonly received?: unknown;
  readonly suggestion?: string;
  readonly retryable: boolean;
  readonly causeName?: string;

  constructor(shape: BuyerSkillErrorShape) {
    super(shape.message);
    this.name = "BuyerSkillToolError";
    this.code = shape.code;
    this.field = shape.field;
    this.received = shape.received;
    this.suggestion = shape.suggestion;
    this.retryable = shape.retryable;
    this.causeName = shape.causeName;
  }

  toJSON(): BuyerSkillErrorShape {
    return {
      code: this.code,
      message: this.message,
      ...(this.field ? { field: this.field } : {}),
      ...(this.received !== undefined ? { received: this.received } : {}),
      ...(this.suggestion ? { suggestion: this.suggestion } : {}),
      retryable: this.retryable,
      ...(this.causeName ? { causeName: this.causeName } : {})
    };
  }
}

export function validationError(message: string, field: string, received?: unknown): BuyerSkillToolError {
  return new BuyerSkillToolError({
    code: "VALIDATION_ERROR",
    message,
    field,
    received,
    suggestion: "Fix the tool arguments and try again.",
    retryable: false
  });
}

export function wrapBuyerSkillError(error: unknown): BuyerSkillToolError {
  if (error instanceof BuyerSkillToolError) {
    return error;
  }

  if (error instanceof BuyerSdkConfigurationError) {
    return new BuyerSkillToolError({
      code: "CONFIGURATION_ERROR",
      message: error.message,
      suggestion: "Check signer, provider, settlement address, storage adapter, and report resolver configuration.",
      retryable: false,
      causeName: error.name
    });
  }

  if (error instanceof BuyerSdkValidationError) {
    return new BuyerSkillToolError({
      code: "BUYER_SDK_ERROR",
      message: error.message,
      suggestion: "Inspect the task state or seller commitment, then retry with corrected expectations or inputs.",
      retryable: false,
      causeName: error.name
    });
  }

  if (error instanceof Error) {
    const code = inferErrorCode(error);
    return new BuyerSkillToolError({
      code,
      message: error.message,
      suggestion: code === "NETWORK_ERROR" ? "Retry after the RPC or wallet issue is resolved." : "Inspect the underlying error and retry if safe.",
      retryable: code === "NETWORK_ERROR" || code === "TIMEOUT",
      causeName: error.name
    });
  }

  return new BuyerSkillToolError({
    code: "UNKNOWN_ERROR",
    message: "Unknown tool error.",
    received: error,
    suggestion: "Inspect the underlying error payload and retry if safe.",
    retryable: false
  });
}

function inferErrorCode(error: Error): BuyerSkillErrorCode {
  const message = error.message.toUpperCase();
  const name = error.name.toUpperCase();

  if (name.includes("TIMEOUT") || message.includes("TIMED OUT")) {
    return "TIMEOUT";
  }

  if (
    name.includes("NETWORK") ||
    message.includes("NETWORK") ||
    message.includes("NONCE") ||
    message.includes("REPLACEMENT") ||
    message.includes("UNDERPRICED") ||
    message.includes("COALESCE")
  ) {
    return "NETWORK_ERROR";
  }

  return "UNKNOWN_ERROR";
}
