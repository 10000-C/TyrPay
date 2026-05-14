import type { SellerSkillErrorCode, SellerSkillErrorShape } from "./types.js";

export class SellerSkillToolError extends Error implements SellerSkillErrorShape {
  readonly code: SellerSkillErrorCode;
  readonly field?: string;
  readonly received?: unknown;
  readonly suggestion?: string;
  readonly retryable: boolean;
  readonly causeName?: string;

  constructor(shape: SellerSkillErrorShape) {
    super(shape.message);
    this.name = "SellerSkillToolError";
    this.code = shape.code;
    this.field = shape.field;
    this.received = shape.received;
    this.suggestion = shape.suggestion;
    this.retryable = shape.retryable;
    this.causeName = shape.causeName;
  }

  toJSON(): SellerSkillErrorShape {
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

export function validationError(message: string, field: string, received?: unknown): SellerSkillToolError {
  return new SellerSkillToolError({
    code: "VALIDATION_ERROR",
    message,
    field,
    received,
    suggestion: "Fix the tool arguments and try again.",
    retryable: false
  });
}

export function wrapSellerSkillError(error: unknown): SellerSkillToolError {
  if (error instanceof SellerSkillToolError) {
    return error;
  }

  if (error instanceof TypeError) {
    return new SellerSkillToolError({
      code: "VALIDATION_ERROR",
      message: error.message,
      suggestion: "Check the input values match the expected format.",
      retryable: false,
      causeName: error.name
    });
  }

  if (error instanceof Error) {
    const code = inferErrorCode(error);
    return new SellerSkillToolError({
      code,
      message: error.message,
      suggestion: code === "NETWORK_ERROR" ? "Retry after the RPC or wallet issue is resolved." : "Inspect the underlying error and retry if safe.",
      retryable: code === "NETWORK_ERROR" || code === "TIMEOUT",
      causeName: error.name
    });
  }

  return new SellerSkillToolError({
    code: "UNKNOWN_ERROR",
    message: "Unknown tool error.",
    received: error,
    suggestion: "Inspect the underlying error payload and retry if safe.",
    retryable: false
  });
}

function inferErrorCode(error: Error): SellerSkillErrorCode {
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
