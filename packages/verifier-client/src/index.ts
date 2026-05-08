import type { AggregateUsage, Bytes32, URI, VerificationReport } from "@fulfillpay/sdk-core";

export interface VerifierClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface VerifyTaskRequest {
  taskId: string;
  markProofsConsumed?: boolean;
}

export interface VerifyTaskResponse {
  report: VerificationReport;
  reportPointer: {
    uri: URI;
    hash: Bytes32;
  };
  checks: Record<string, boolean>;
  aggregateUsage: AggregateUsage;
  consumed: boolean;
}

export class VerifierClient {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VerifierClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async verifyTask(input: string | VerifyTaskRequest): Promise<VerifyTaskResponse> {
    const request = typeof input === "string" ? { taskId: input } : input;
    const response = await this.fetchImpl(new URL("verify", ensureTrailingSlash(this.baseUrl)).href, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      const message = extractErrorMessage(payload);
      throw new VerifierClientError(message, response.status, payload);
    }

    return payload as VerifyTaskResponse;
  }
}

export class VerifierClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown
  ) {
    super(message);
    this.name = "VerifierClientError";
  }
}

export function createVerifierClient(options: VerifierClientOptions): VerifierClient {
  return new VerifierClient(options);
}

function ensureTrailingSlash(url: URL): URL {
  const next = new URL(url.href);
  if (!next.pathname.endsWith("/")) {
    next.pathname = `${next.pathname}/`;
  }

  return next;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as unknown;
}

function extractErrorMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.message === "string") {
    return payload.message;
  }

  return "Verifier request failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
