import {
  SCHEMA_VERSIONS,
  hashObject,
  normalizeAddress,
  normalizeBytes32,
  type Address,
  type Bytes32,
  type DeliveryReceipt,
  type ExtractedReceiptFields,
  type TaskContext,
  type UnixMillis
} from "@tyrpay/sdk-core";

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

export const ZERO_G_TEETLS_PROVIDER = "0g-teetls" as const;
export const ZERO_G_TEETLS_RAW_PROOF_SCHEMA_VERSION = "TyrPay.0g-teetls-proof.v1" as const;
export const DEFAULT_ZERO_G_TEETLS_REQUEST_PATH = "/chat/completions" as const;
const DEFAULT_SDK_PACKAGE = "@0gfoundation/0g-compute-ts-sdk" as const;

const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export type ZeroGUsageSource = "response.body.usage" | "response.body.x_groq.usage" | "custom";
export type ZeroGContentSource = "choices[0].message.content" | "choices[0].delta.content" | "custom";

export interface ZeroGResponseExtractionProfile {
  usagePath?: string;
  contentPath?: string;
  modelPath?: string;
}

export interface ZeroGTeeTlsAdapterConfig {
  signer?: unknown;
  providerAddress?: string;
  defaultRequestPath?: string;
  brokerFactory?: ZeroGComputeBrokerFactory;
  fetchImpl?: FetchLike;
  clock?: () => number | bigint | string | Promise<number | bigint | string>;
}

export type ZeroGComputeBrokerFactory = (input: {
  signer?: unknown;
}) => Promise<ZeroGComputeBrokerLike> | ZeroGComputeBrokerLike;

export interface ZeroGComputeBrokerLike {
  inference: {
    getServiceMetadata(providerAddress: string): Promise<{ endpoint: string; model: string }>;
    getRequestHeaders(providerAddress: string, content?: string): Promise<Record<string, string>>;
    processResponse(providerAddress: string, chatId?: string, content?: string): Promise<boolean | null>;
    checkProviderSignerStatus?(providerAddress: string): Promise<{
      isAcknowledged: boolean;
      teeSignerAddress: string;
    }>;
  };
}

export interface ZeroGTeeTlsProvenFetchInput {
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: Bytes32;
  request: ZkTlsRequestEvidence;
  declaredModel: string;
  providerAddress?: string;
  queryContent?: string;
  requestPath?: string;
  responseExtractionProfile?: ZeroGResponseExtractionProfile;
}

export interface ZeroGTeeTlsRawProofPayload {
  proofSchemaVersion: typeof ZERO_G_TEETLS_RAW_PROOF_SCHEMA_VERSION;
  provider: typeof ZERO_G_TEETLS_PROVIDER;
  providerProofId: string;
  proofContext: ProviderProofContext;
  request: ZkTlsRequestEvidence;
  response: ZkTlsResponseEvidence;
  observedAt: UnixMillis;
  extracted: ExtractedReceiptFields;
  zeroG: {
    providerAddress: Address;
    endpoint: string;
    modelFromMetadata: string;
    requestHeaderKeys: string[];
    chatId?: string;
    processResponseResult: boolean | null;
    teeSignerAddress?: Address;
    signerAcknowledged?: boolean;
  };
  metadata: {
    sdkPackage: typeof DEFAULT_SDK_PACKAGE;
    requestPath: string;
    usageSource: ZeroGUsageSource;
    contentSource: ZeroGContentSource;
  };
}

export interface ZeroGTeeTlsRawProof extends ZeroGTeeTlsRawProofPayload {
  proofHash: Bytes32;
}

type FetchLike = (input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{
  status: number;
  headers: FetchHeadersLike;
  text(): Promise<string>;
}>;

interface FetchHeadersLike {
  get(name: string): string | null;
  forEach?(callback: (value: string, key: string) => void): void;
}

export class ZeroGTeeTlsAdapter
  implements ZkTlsAdapter<ZeroGTeeTlsRawProof, ZeroGTeeTlsProvenFetchInput, ZkTlsResponseEvidence["body"]>
{
  readonly name = ZERO_G_TEETLS_PROVIDER;

  constructor(private readonly config: ZeroGTeeTlsAdapterConfig = {}) {}

  async provenFetch(
    input: ZeroGTeeTlsProvenFetchInput
  ): Promise<ProvenFetchResult<ZeroGTeeTlsRawProof, ZkTlsResponseEvidence["body"]>> {
    const providerAddress = normalizeAddress(
      input.providerAddress ?? this.config.providerAddress ?? "",
      "providerAddress"
    );
    const broker = await this.createBroker();
    const serviceMetadata = await broker.inference.getServiceMetadata(providerAddress);
    const requestPath = input.requestPath ?? this.config.defaultRequestPath ?? DEFAULT_ZERO_G_TEETLS_REQUEST_PATH;
    const finalUrl = buildFinalUrl(serviceMetadata.endpoint, requestPath);
    const finalUrlObject = new URL(finalUrl);
    const request = normalizeRequestEvidence({
      ...input.request,
      host: finalUrlObject.host,
      path: finalUrlObject.pathname,
      method: input.request.method.toUpperCase()
    });
    assertRequestMatchesResolvedEndpoint(request, finalUrlObject);

    const proofContext = buildProviderProofContext({
      taskContext: input.taskContext,
      callIndex: input.callIndex,
      callIntentHash: input.callIntentHash
    });
    const requestBody = buildRequestBody(input.request.body, serviceMetadata.model);
    const queryContent = input.queryContent ?? extractPromptContent(requestBody);
    const headers = await broker.inference.getRequestHeaders(providerAddress, queryContent);
    const fetchImpl = this.config.fetchImpl ?? globalThis.fetch;

    if (typeof fetchImpl !== "function") {
      throw new TypeError("ZeroGTeeTlsAdapter requires fetchImpl or global fetch.");
    }

    const response = await fetchImpl(finalUrl, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(requestBody)
    });
    const responseHeaders = headersToRecord(response.headers);
    const responseText = await response.text();
    const responseBody = parseJson(responseText);
    const normalizedResponse = normalizeResponseEvidence({
      status: response.status,
      ...(Object.keys(responseHeaders).length > 0 ? { headers: responseHeaders } : {}),
      body: responseBody ?? responseText
    });
    const extraction = extractOpenAiCompatibleFields(
      normalizedResponse.body,
      serviceMetadata.model,
      input.responseExtractionProfile
    );
    const chatId = extractChatId(response.headers, normalizedResponse.body);
    const processResponseResult = await broker.inference.processResponse(
      providerAddress,
      chatId,
      extraction.content ?? undefined
    );
    const signerStatus = await tryGetSignerStatus(broker, providerAddress);
    const observedAt = toUnixMillisString(await this.resolveClock(), "observedAt");
    const payload: ZeroGTeeTlsRawProofPayload = {
      proofSchemaVersion: ZERO_G_TEETLS_RAW_PROOF_SCHEMA_VERSION,
      provider: ZERO_G_TEETLS_PROVIDER,
      providerProofId: deriveProviderProofId({
        providerAddress,
        endpoint: finalUrl,
        model: serviceMetadata.model,
        response: normalizedResponse,
        observedAt,
        chatId
      }),
      proofContext,
      request,
      response: normalizedResponse,
      observedAt,
      extracted: extraction.extracted,
      zeroG: {
        providerAddress,
        endpoint: finalUrl,
        modelFromMetadata: serviceMetadata.model,
        requestHeaderKeys: Object.keys(headers).sort(),
        ...(chatId ? { chatId } : {}),
        processResponseResult,
        ...(signerStatus?.teeSignerAddress ? { teeSignerAddress: normalizeAddress(signerStatus.teeSignerAddress, "teeSignerAddress") } : {}),
        ...(signerStatus ? { signerAcknowledged: signerStatus.isAcknowledged } : {})
      },
      metadata: {
        sdkPackage: DEFAULT_SDK_PACKAGE,
        requestPath,
        usageSource: extraction.usageSource,
        contentSource: extraction.contentSource
      }
    };
    const rawProof: ZeroGTeeTlsRawProof = {
      ...payload,
      proofHash: hashZeroGTeeTlsRawProofPayload(payload)
    };

    return {
      response: rawProof.response.body,
      rawProof,
      extracted: rawProof.extracted
    };
  }

  async verifyRawProof(rawProof: ZeroGTeeTlsRawProof): Promise<boolean> {
    try {
      assertZeroGTeeTlsRawProof(rawProof);

      if (hashZeroGTeeTlsRawProofPayload(toZeroGTeeTlsRawProofPayload(rawProof)) !== rawProof.proofHash) {
        return false;
      }

      if (rawProof.zeroG.processResponseResult !== true) {
        return false;
      }

      const extracted = extractOpenAiCompatibleFields(rawProof.response.body, rawProof.zeroG.modelFromMetadata);
      if (
        rawProof.extracted.model !== extracted.extracted.model ||
        rawProof.extracted.usage.totalTokens !== extracted.extracted.usage.totalTokens
      ) {
        return false;
      }

      const responseModel = extractStringByPath(rawProof.response.body, "model");
      if (responseModel !== null && responseModel !== rawProof.zeroG.modelFromMetadata) {
        return false;
      }

      return rawProof.extracted.model === rawProof.zeroG.modelFromMetadata;
    } catch {
      return false;
    }
  }

  async normalizeReceipt(rawProof: ZeroGTeeTlsRawProof, context: ZkTlsReceiptContext): Promise<DeliveryReceipt> {
    if (!(await this.verifyRawProof(rawProof))) {
      throw new TypeError("0G TeeTLS raw proof failed verification.");
    }

    assertReceiptContextMatchesProofContext(rawProof.proofContext, context);
    assertString(context.rawProofURI, "rawProofURI");

    return {
      schemaVersion: SCHEMA_VERSIONS.deliveryReceipt,
      taskContext: context.taskContext,
      callIndex: context.callIndex,
      callIntentHash: normalizeBytes32(context.callIntentHash, "callIntentHash"),
      provider: rawProof.provider,
      providerProofId: rawProof.providerProofId,
      requestHash: hashRequestEvidence(rawProof.request),
      responseHash: hashResponseEvidence(rawProof.response),
      observedAt: rawProof.observedAt,
      extracted: rawProof.extracted,
      rawProofHash: hashZeroGTeeTlsRawProof(rawProof),
      rawProofURI: context.rawProofURI
    };
  }

  async extractReceiptEvidence(rawProof: unknown) {
    try {
      assertZeroGTeeTlsRawProof(rawProof);
      return {
        provider: rawProof.provider,
        providerProofId: rawProof.providerProofId,
        request: rawProof.request,
        response: rawProof.response,
        observedAt: rawProof.observedAt,
        extracted: rawProof.extracted
      };
    } catch {
      return null;
    }
  }

  private async createBroker(): Promise<ZeroGComputeBrokerLike> {
    if (this.config.brokerFactory) {
      return this.config.brokerFactory({ signer: this.config.signer });
    }

    const module = (await dynamicImport(DEFAULT_SDK_PACKAGE)) as {
      createZGComputeNetworkBroker?: (signer: unknown) => Promise<ZeroGComputeBrokerLike>;
    };

    if (typeof module.createZGComputeNetworkBroker !== "function") {
      throw new TypeError(`${DEFAULT_SDK_PACKAGE} does not export createZGComputeNetworkBroker.`);
    }

    return module.createZGComputeNetworkBroker(this.config.signer);
  }

  private async resolveClock(): Promise<number | bigint | string> {
    return this.config.clock ? this.config.clock() : Date.now();
  }
}

export function hashZeroGTeeTlsRawProofPayload(payload: ZeroGTeeTlsRawProofPayload): Bytes32 {
  assertZeroGTeeTlsRawProofPayload(payload);
  return hashObject(payload);
}

export function hashZeroGTeeTlsRawProof(rawProof: ZeroGTeeTlsRawProof): Bytes32 {
  assertZeroGTeeTlsRawProof(rawProof);
  return hashObject(rawProof);
}

export function toZeroGTeeTlsRawProofPayload(rawProof: ZeroGTeeTlsRawProof): ZeroGTeeTlsRawProofPayload {
  const { proofHash: _proofHash, ...payload } = rawProof;
  return payload;
}

function buildFinalUrl(endpoint: string, requestPath: string): string {
  assertString(endpoint, "endpoint");
  assertString(requestPath, "requestPath");

  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const suffix = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  return `${base}${suffix}`;
}

function assertRequestMatchesResolvedEndpoint(request: ZkTlsRequestEvidence, url: URL): void {
  if (request.host !== url.host) {
    throw new TypeError(`request.host "${request.host}" does not match 0G endpoint host "${url.host}".`);
  }

  if (request.path !== url.pathname) {
    throw new TypeError(`request.path "${request.path}" does not match 0G endpoint path "${url.pathname}".`);
  }

  if (request.method !== "POST") {
    throw new TypeError("0G TeeTLS adapter only supports POST OpenAI-compatible requests.");
  }
}

function buildRequestBody(body: unknown, model: string): Record<string, unknown> {
  const object = assertPlainRecord(body, "request.body");
  return {
    ...object,
    model
  };
}

function extractPromptContent(body: Record<string, unknown>): string | undefined {
  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return undefined;
  }

  return messages
    .map((message) => {
      if (!isPlainRecord(message)) {
        return "";
      }

      return typeof message.content === "string" ? message.content : "";
    })
    .filter((content) => content.length > 0)
    .join("\n");
}

function headersToRecord(headers: FetchHeadersLike): Record<string, string> {
  const output: Record<string, string> = {};

  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      output[key.toLowerCase()] = value;
    });
    return output;
  }

  for (const key of ["content-type", "zg-res-key"]) {
    const value = headers.get(key);
    if (value !== null) {
      output[key] = value;
    }
  }

  return output;
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractOpenAiCompatibleFields(
  body: unknown,
  metadataModel: string,
  profile: ZeroGResponseExtractionProfile = {}
): {
  extracted: ExtractedReceiptFields;
  content: string | null;
  usageSource: ZeroGUsageSource;
  contentSource: ZeroGContentSource;
} {
  const responseModel = extractStringByPath(body, profile.modelPath ?? "model");
  const model = responseModel ?? metadataModel;
  const usageFromCustomPath = profile.usagePath ? extractNumberByPath(body, profile.usagePath) : null;
  const usageFromStandardPath = extractNumberByPath(body, "usage.total_tokens");
  const usageFromGroqPath = extractNumberByPath(body, "x_groq.usage.total_tokens");
  const totalTokens = usageFromCustomPath ?? usageFromStandardPath ?? usageFromGroqPath;

  if (totalTokens === null) {
    throw new TypeError("0G TeeTLS response does not include recoverable usage.total_tokens.");
  }

  const customContent = profile.contentPath ? extractStringByPath(body, profile.contentPath) : null;
  const messageContent = extractStringByPath(body, "choices.0.message.content");
  const deltaContent = extractStringByPath(body, "choices.0.delta.content");
  const content = customContent ?? messageContent ?? deltaContent;

  return {
    extracted: {
      model,
      usage: {
        totalTokens
      }
    },
    content,
    usageSource: usageFromCustomPath !== null ? "custom" : usageFromStandardPath !== null ? "response.body.usage" : "response.body.x_groq.usage",
    contentSource: customContent !== null ? "custom" : messageContent !== null ? "choices[0].message.content" : "choices[0].delta.content"
  };
}

function extractChatId(headers: { get(name: string): string | null }, body: unknown): string | undefined {
  const headerChatId = headers.get("zg-res-key");
  if (headerChatId && headerChatId.length > 0) {
    return headerChatId;
  }

  return extractStringByPath(body, "id") ?? extractStringByPath(body, "chatID") ?? undefined;
}

function deriveProviderProofId(input: {
  providerAddress: Address;
  endpoint: string;
  model: string;
  response: ZkTlsResponseEvidence;
  observedAt: UnixMillis;
  chatId?: string;
}): string {
  if (input.chatId && input.chatId.length > 0) {
    return input.chatId;
  }

  return `0g-teetls-${hashObject({
    providerAddress: input.providerAddress,
    endpoint: input.endpoint,
    model: input.model,
    responseHash: hashResponseEvidence(input.response),
    observedAt: input.observedAt
  }).slice(2, 18)}`;
}

async function tryGetSignerStatus(
  broker: ZeroGComputeBrokerLike,
  providerAddress: Address
): Promise<{ isAcknowledged: boolean; teeSignerAddress: string } | null> {
  if (typeof broker.inference.checkProviderSignerStatus !== "function") {
    return null;
  }

  try {
    return await broker.inference.checkProviderSignerStatus(providerAddress);
  } catch {
    return null;
  }
}

function assertZeroGTeeTlsRawProof(rawProof: unknown): asserts rawProof is ZeroGTeeTlsRawProof {
  assertZeroGTeeTlsRawProofPayload(rawProof);
  normalizeBytes32((rawProof as ZeroGTeeTlsRawProof).proofHash, "proofHash");
}

function assertZeroGTeeTlsRawProofPayload(payload: unknown): asserts payload is ZeroGTeeTlsRawProofPayload {
  const object = assertPlainRecord(payload, "ZeroGTeeTlsRawProofPayload");

  if (object.proofSchemaVersion !== ZERO_G_TEETLS_RAW_PROOF_SCHEMA_VERSION) {
    throw new TypeError("proofSchemaVersion must be TyrPay.0g-teetls-proof.v1.");
  }

  if (object.provider !== ZERO_G_TEETLS_PROVIDER) {
    throw new TypeError("provider must be 0g-teetls.");
  }

  assertString(object.providerProofId, "providerProofId");
  assertPlainRecord(object.proofContext, "proofContext");
  normalizeRequestEvidence(object.request as never);
  normalizeResponseEvidence(object.response as never);
  toUnixMillisString(object.observedAt as never, "observedAt");
  assertExtractedFields(object.extracted);
  assertZeroGMetadata(object.zeroG);
  assertEnvelopeMetadata(object.metadata);
}

function assertZeroGMetadata(value: unknown): void {
  const object = assertPlainRecord(value, "zeroG");
  normalizeAddress(assertStringValue(object.providerAddress, "zeroG.providerAddress"), "zeroG.providerAddress");
  assertString(object.endpoint, "zeroG.endpoint");
  assertString(object.modelFromMetadata, "zeroG.modelFromMetadata");
  assertStringArray(object.requestHeaderKeys, "zeroG.requestHeaderKeys");

  if (object.chatId !== undefined) {
    assertString(object.chatId, "zeroG.chatId");
  }

  if (typeof object.processResponseResult !== "boolean" && object.processResponseResult !== null) {
    throw new TypeError("zeroG.processResponseResult must be boolean or null.");
  }

  if (object.teeSignerAddress !== undefined) {
    normalizeAddress(assertStringValue(object.teeSignerAddress, "zeroG.teeSignerAddress"), "zeroG.teeSignerAddress");
  }

  if (object.signerAcknowledged !== undefined && typeof object.signerAcknowledged !== "boolean") {
    throw new TypeError("zeroG.signerAcknowledged must be a boolean.");
  }
}

function assertEnvelopeMetadata(value: unknown): void {
  const object = assertPlainRecord(value, "metadata");

  if (object.sdkPackage !== DEFAULT_SDK_PACKAGE) {
    throw new TypeError(`metadata.sdkPackage must be ${DEFAULT_SDK_PACKAGE}.`);
  }

  assertString(object.requestPath, "metadata.requestPath");

  if (!["response.body.usage", "response.body.x_groq.usage", "custom"].includes(String(object.usageSource))) {
    throw new TypeError("metadata.usageSource is unsupported.");
  }

  if (!["choices[0].message.content", "choices[0].delta.content", "custom"].includes(String(object.contentSource))) {
    throw new TypeError("metadata.contentSource is unsupported.");
  }
}

function assertExtractedFields(value: unknown): asserts value is ExtractedReceiptFields {
  const object = assertPlainRecord(value, "extracted");
  assertString(object.model, "extracted.model");
  const usage = assertPlainRecord(object.usage, "extracted.usage");
  assertSafeInteger(usage.totalTokens, "extracted.usage.totalTokens");
}

function extractStringByPath(value: unknown, path: string): string | null {
  const found = readPath(value, path);
  return typeof found === "string" && found.length > 0 ? found : null;
}

function extractNumberByPath(value: unknown, path: string): number | null {
  const found = readPath(value, path);

  if (typeof found !== "number" || !Number.isSafeInteger(found) || found < 0) {
    return null;
  }

  return found;
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === undefined || current === null) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isSafeInteger(index) ? current[index] : undefined;
    }

    if (isPlainRecord(current)) {
      return current[segment];
    }

    return undefined;
  }, value);
}

function assertPlainRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new TypeError(`${fieldName} must be a plain object.`);
  }

  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
}

function assertStringValue(value: unknown, fieldName: string): string {
  assertString(value, fieldName);
  return value;
}

function assertStringArray(value: unknown, fieldName: string): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  value.forEach((item, index) => assertString(item, `${fieldName}[${index}]`));
}

function assertSafeInteger(value: unknown, fieldName: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${fieldName} must be a non-negative safe integer.`);
  }
}
