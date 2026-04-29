export type HexString = `0x${string}`;
export type Address = HexString;
export type Bytes32 = HexString;
export type UIntString = string;
export type UnixMillis = UIntString;
export type URI = string;

export const PROTOCOL_NAME = "FulfillPay" as const;
export const PROTOCOL_VERSION = 1 as const;
export const EIP712_DOMAIN_NAME = "FulfillPay" as const;
export const EIP712_DOMAIN_VERSION = "1" as const;

export const SCHEMA_VERSIONS = {
  taskIntent: "fulfillpay.task-intent.v1",
  taskContext: "fulfillpay.task-context.v1",
  executionCommitment: "fulfillpay.execution-commitment.v1",
  callIntent: "fulfillpay.call-intent.v1",
  deliveryReceipt: "fulfillpay.delivery-receipt.v1",
  proofBundle: "fulfillpay.proof-bundle.v1",
  verificationReport: "fulfillpay.verification-report.v1"
} as const;

export type TaskStatus =
  | "INTENT_CREATED"
  | "COMMITMENT_SUBMITTED"
  | "FUNDED"
  | "PROOF_SUBMITTED"
  | "SETTLED"
  | "REFUNDED";

export type DerivedTaskStatus = TaskStatus | "EXECUTING" | "VERIFIED_PASS" | "VERIFIED_FAIL" | "EXPIRED";
export type SettlementAction = "RELEASE" | "REFUND";

export const SETTLEMENT_ACTION_CODES: Record<SettlementAction, number> = {
  RELEASE: 1,
  REFUND: 2
} as const;

export type UIntLike = number | bigint | UIntString;

export interface TaskIntent {
  schemaVersion: typeof SCHEMA_VERSIONS.taskIntent;
  buyer: Address;
  seller: Address;
  token: Address;
  amount: UIntString;
  deadline: UnixMillis;
  metadataHash?: Bytes32;
  metadataURI?: URI;
}

export interface TaskContext {
  schemaVersion: typeof SCHEMA_VERSIONS.taskContext;
  protocol: typeof PROTOCOL_NAME;
  version: typeof PROTOCOL_VERSION;
  chainId: UIntString;
  settlementContract: Address;
  taskId: Bytes32;
  taskNonce: Bytes32;
  commitmentHash: Bytes32;
  buyer: Address;
  seller: Address;
}

export interface CommitmentTarget {
  host: string;
  path: string;
  method: string;
}

export interface UsageThreshold {
  totalTokens: number;
}

export interface ExecutionCommitment {
  schemaVersion: typeof SCHEMA_VERSIONS.executionCommitment;
  taskId: Bytes32;
  buyer: Address;
  seller: Address;
  target: CommitmentTarget;
  allowedModels: string[];
  minUsage: UsageThreshold;
  deadline: UnixMillis;
  verifier: Address;
  termsHash?: Bytes32;
  termsURI?: URI;
}

export interface CallIntent {
  schemaVersion: typeof SCHEMA_VERSIONS.callIntent;
  taskContextHash: Bytes32;
  callIndex: number;
  host: string;
  path: string;
  method: string;
  declaredModel: string;
  requestBodyHash: Bytes32;
}

export interface ReceiptUsage {
  totalTokens: number;
}

export interface ExtractedReceiptFields {
  model: string;
  usage: ReceiptUsage;
}

export interface DeliveryReceipt {
  schemaVersion: typeof SCHEMA_VERSIONS.deliveryReceipt;
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: Bytes32;
  provider: string;
  providerProofId: string;
  requestHash: Bytes32;
  responseHash: Bytes32;
  observedAt: UnixMillis;
  extracted: ExtractedReceiptFields;
  rawProofHash: Bytes32;
  rawProofURI: URI;
}

export interface AggregateUsage {
  totalTokens: number;
}

export interface ProofBundle {
  schemaVersion: typeof SCHEMA_VERSIONS.proofBundle;
  taskId: Bytes32;
  commitmentHash: Bytes32;
  seller: Address;
  receipts: DeliveryReceipt[];
  aggregateUsage: AggregateUsage;
  createdAt: UnixMillis;
}

export type VerificationChecks = Record<string, boolean>;

export interface VerificationSettlement {
  action: SettlementAction;
  amount: UIntString;
}

export interface VerificationReportBase {
  schemaVersion: typeof SCHEMA_VERSIONS.verificationReport;
  chainId: UIntString;
  settlementContract: Address;
  taskId: Bytes32;
  buyer: Address;
  seller: Address;
  commitmentHash: Bytes32;
  proofBundleHash: Bytes32;
  passed: boolean;
  checks: VerificationChecks;
  aggregateUsage: AggregateUsage;
  settlement: VerificationSettlement;
  verifier: Address;
  verifiedAt: UnixMillis;
  reportHash?: Bytes32;
}

export interface UnsignedVerificationReport extends VerificationReportBase {
  signature?: never;
}

export interface VerificationReport extends VerificationReportBase {
  signature: string;
}

export type ProtocolObject =
  | TaskIntent
  | TaskContext
  | ExecutionCommitment
  | CallIntent
  | DeliveryReceipt
  | ProofBundle
  | UnsignedVerificationReport
  | VerificationReport;

export interface BuildTaskContextInput {
  chainId: UIntLike;
  settlementContract: string;
  taskId: string;
  taskNonce: string;
  commitmentHash: string;
  buyer: string;
  seller: string;
}

export interface BuildCallIntentInput {
  taskContextHash: string;
  callIndex: number;
  host: string;
  path: string;
  method: string;
  declaredModel: string;
  requestBodyHash: string;
}

const ADDRESS_LENGTH = 42;
const BYTES32_LENGTH = 66;
const HEX_BODY_PATTERN = /^[0-9a-f]+$/;
const UINT_STRING_PATTERN = /^(0|[1-9][0-9]*)$/;

export function isAddress(value: unknown): value is Address {
  return typeof value === "string" && value.length === ADDRESS_LENGTH && value.startsWith("0x") && HEX_BODY_PATTERN.test(value.slice(2));
}

export function isBytes32(value: unknown): value is Bytes32 {
  return typeof value === "string" && value.length === BYTES32_LENGTH && value.startsWith("0x") && HEX_BODY_PATTERN.test(value.slice(2));
}

export function isUIntString(value: unknown): value is UIntString {
  return typeof value === "string" && UINT_STRING_PATTERN.test(value);
}

export function isUnixMillis(value: unknown): value is UnixMillis {
  return isUIntString(value);
}

export function isProtocolObject(value: unknown): value is ProtocolObject {
  try {
    assertProtocolObject(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeAddress(value: string, fieldName = "address"): Address {
  const normalized = value.toLowerCase();
  assertAddress(normalized, fieldName);
  return normalized;
}

export function normalizeBytes32(value: string, fieldName = "bytes32"): Bytes32 {
  const normalized = value.toLowerCase();
  assertBytes32(normalized, fieldName);
  return normalized;
}

export function normalizeUIntString(value: UIntLike, fieldName = "uint"): UIntString {
  if (typeof value === "string") {
    assertUIntString(value, fieldName);
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${fieldName} must be a non-negative safe integer.`);
    }

    return String(value);
  }

  if (value < 0n) {
    throw new TypeError(`${fieldName} must be non-negative.`);
  }

  return value.toString();
}

export function settlementActionToCode(action: SettlementAction): number {
  return SETTLEMENT_ACTION_CODES[action];
}

export function buildTaskContext(input: BuildTaskContextInput): TaskContext {
  return {
    schemaVersion: SCHEMA_VERSIONS.taskContext,
    protocol: PROTOCOL_NAME,
    version: PROTOCOL_VERSION,
    chainId: normalizeUIntString(input.chainId, "chainId"),
    settlementContract: normalizeAddress(input.settlementContract, "settlementContract"),
    taskId: normalizeBytes32(input.taskId, "taskId"),
    taskNonce: normalizeBytes32(input.taskNonce, "taskNonce"),
    commitmentHash: normalizeBytes32(input.commitmentHash, "commitmentHash"),
    buyer: normalizeAddress(input.buyer, "buyer"),
    seller: normalizeAddress(input.seller, "seller")
  };
}

export function buildCallIntent(input: BuildCallIntentInput): CallIntent {
  const callIntent: CallIntent = {
    schemaVersion: SCHEMA_VERSIONS.callIntent,
    taskContextHash: normalizeBytes32(input.taskContextHash, "taskContextHash"),
    callIndex: input.callIndex,
    host: input.host,
    path: input.path,
    method: input.method.toUpperCase(),
    declaredModel: input.declaredModel,
    requestBodyHash: normalizeBytes32(input.requestBodyHash, "requestBodyHash")
  };

  assertCallIntent(callIntent);
  return callIntent;
}

export function assertProtocolObject(value: unknown): asserts value is ProtocolObject {
  const schemaVersion = getSchemaVersion(value);

  switch (schemaVersion) {
    case SCHEMA_VERSIONS.taskIntent:
      assertTaskIntent(value);
      return;
    case SCHEMA_VERSIONS.taskContext:
      assertTaskContext(value);
      return;
    case SCHEMA_VERSIONS.executionCommitment:
      assertExecutionCommitment(value);
      return;
    case SCHEMA_VERSIONS.callIntent:
      assertCallIntent(value);
      return;
    case SCHEMA_VERSIONS.deliveryReceipt:
      assertDeliveryReceipt(value);
      return;
    case SCHEMA_VERSIONS.proofBundle:
      assertProofBundle(value);
      return;
    case SCHEMA_VERSIONS.verificationReport:
      if (hasOwn(value, "signature")) {
        assertVerificationReport(value);
        return;
      }

      assertUnsignedVerificationReport(value);
      return;
    default:
      throw new TypeError(`Unsupported schemaVersion: ${schemaVersion}.`);
  }
}

export function assertTaskIntent(value: unknown): asserts value is TaskIntent {
  const object = assertObject(value, "TaskIntent");
  assertExactKeys(object, ["schemaVersion", "buyer", "seller", "token", "amount", "deadline"], ["metadataHash", "metadataURI"], "TaskIntent");
  assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.taskIntent, "TaskIntent.schemaVersion");
  assertAddress(object.buyer, "TaskIntent.buyer");
  assertAddress(object.seller, "TaskIntent.seller");
  assertAddress(object.token, "TaskIntent.token");
  assertUIntString(object.amount, "TaskIntent.amount");
  assertUnixMillis(object.deadline, "TaskIntent.deadline");
  assertOptionalBytes32(object.metadataHash, "TaskIntent.metadataHash");
  assertOptionalString(object.metadataURI, "TaskIntent.metadataURI");
}

export function assertTaskContext(value: unknown): asserts value is TaskContext {
  const object = assertObject(value, "TaskContext");
  assertExactKeys(
    object,
    ["schemaVersion", "protocol", "version", "chainId", "settlementContract", "taskId", "taskNonce", "commitmentHash", "buyer", "seller"],
    [],
    "TaskContext"
  );
  assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.taskContext, "TaskContext.schemaVersion");
  assertLiteral(object.protocol, PROTOCOL_NAME, "TaskContext.protocol");
  assertLiteral(object.version, PROTOCOL_VERSION, "TaskContext.version");
  assertUIntString(object.chainId, "TaskContext.chainId");
  assertAddress(object.settlementContract, "TaskContext.settlementContract");
  assertBytes32(object.taskId, "TaskContext.taskId");
  assertBytes32(object.taskNonce, "TaskContext.taskNonce");
  assertBytes32(object.commitmentHash, "TaskContext.commitmentHash");
  assertAddress(object.buyer, "TaskContext.buyer");
  assertAddress(object.seller, "TaskContext.seller");
}

export function assertExecutionCommitment(value: unknown): asserts value is ExecutionCommitment {
  const object = assertObject(value, "ExecutionCommitment");
  assertExactKeys(
    object,
    ["schemaVersion", "taskId", "buyer", "seller", "target", "allowedModels", "minUsage", "deadline", "verifier"],
    ["termsHash", "termsURI"],
    "ExecutionCommitment"
  );
  assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.executionCommitment, "ExecutionCommitment.schemaVersion");
  assertBytes32(object.taskId, "ExecutionCommitment.taskId");
  assertAddress(object.buyer, "ExecutionCommitment.buyer");
  assertAddress(object.seller, "ExecutionCommitment.seller");
  assertCommitmentTarget(object.target, "ExecutionCommitment.target");
  assertStringArray(object.allowedModels, "ExecutionCommitment.allowedModels", { minLength: 1 });
  assertUsageThreshold(object.minUsage, "ExecutionCommitment.minUsage");
  assertUnixMillis(object.deadline, "ExecutionCommitment.deadline");
  assertAddress(object.verifier, "ExecutionCommitment.verifier");
  assertOptionalBytes32(object.termsHash, "ExecutionCommitment.termsHash");
  assertOptionalString(object.termsURI, "ExecutionCommitment.termsURI");
}

export function assertCallIntent(value: unknown): asserts value is CallIntent {
  const object = assertObject(value, "CallIntent");
  assertExactKeys(
    object,
    ["schemaVersion", "taskContextHash", "callIndex", "host", "path", "method", "declaredModel", "requestBodyHash"],
    [],
    "CallIntent"
  );
  assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.callIntent, "CallIntent.schemaVersion");
  assertBytes32(object.taskContextHash, "CallIntent.taskContextHash");
  assertSafeInteger(object.callIndex, "CallIntent.callIndex", { min: 0 });
  assertString(object.host, "CallIntent.host");
  assertString(object.path, "CallIntent.path");
  assertUppercaseString(object.method, "CallIntent.method");
  assertString(object.declaredModel, "CallIntent.declaredModel");
  assertBytes32(object.requestBodyHash, "CallIntent.requestBodyHash");
}

export function assertDeliveryReceipt(value: unknown): asserts value is DeliveryReceipt {
  const object = assertObject(value, "DeliveryReceipt");
  assertExactKeys(
    object,
    ["schemaVersion", "taskContext", "callIndex", "callIntentHash", "provider", "providerProofId", "requestHash", "responseHash", "observedAt", "extracted", "rawProofHash", "rawProofURI"],
    [],
    "DeliveryReceipt"
  );
  assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.deliveryReceipt, "DeliveryReceipt.schemaVersion");
  assertTaskContext(object.taskContext);
  assertSafeInteger(object.callIndex, "DeliveryReceipt.callIndex", { min: 0 });
  assertBytes32(object.callIntentHash, "DeliveryReceipt.callIntentHash");
  assertString(object.provider, "DeliveryReceipt.provider");
  assertString(object.providerProofId, "DeliveryReceipt.providerProofId");
  assertBytes32(object.requestHash, "DeliveryReceipt.requestHash");
  assertBytes32(object.responseHash, "DeliveryReceipt.responseHash");
  assertUnixMillis(object.observedAt, "DeliveryReceipt.observedAt");
  assertExtractedReceiptFields(object.extracted, "DeliveryReceipt.extracted");
  assertBytes32(object.rawProofHash, "DeliveryReceipt.rawProofHash");
  assertString(object.rawProofURI, "DeliveryReceipt.rawProofURI");
}

export function assertProofBundle(value: unknown): asserts value is ProofBundle {
  const object = assertObject(value, "ProofBundle");
  assertExactKeys(
    object,
    ["schemaVersion", "taskId", "commitmentHash", "seller", "receipts", "aggregateUsage", "createdAt"],
    [],
    "ProofBundle"
  );
  assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.proofBundle, "ProofBundle.schemaVersion");
  assertBytes32(object.taskId, "ProofBundle.taskId");
  assertBytes32(object.commitmentHash, "ProofBundle.commitmentHash");
  assertAddress(object.seller, "ProofBundle.seller");
  assertArray(object.receipts, "ProofBundle.receipts", { minLength: 1 });
  object.receipts.forEach((receipt) => assertDeliveryReceipt(receipt));
  assertAggregateUsage(object.aggregateUsage, "ProofBundle.aggregateUsage");
  assertUnixMillis(object.createdAt, "ProofBundle.createdAt");
  assertProofBundleReceipts(object as unknown as ProofBundle);
}

export function assertUnsignedVerificationReport(value: unknown): asserts value is UnsignedVerificationReport {
  const object = assertObject(value, "UnsignedVerificationReport");
  assertExactKeys(
    object,
    ["schemaVersion", "chainId", "settlementContract", "taskId", "buyer", "seller", "commitmentHash", "proofBundleHash", "passed", "checks", "aggregateUsage", "settlement", "verifier", "verifiedAt"],
    ["reportHash"],
    "UnsignedVerificationReport"
  );
  assertVerificationReportBase(object, "UnsignedVerificationReport");
  if (hasOwn(object, "signature")) {
    throw new TypeError("UnsignedVerificationReport.signature must be absent.");
  }
}

export function assertVerificationReport(value: unknown): asserts value is VerificationReport {
  const object = assertObject(value, "VerificationReport");
  assertExactKeys(
    object,
    ["schemaVersion", "chainId", "settlementContract", "taskId", "buyer", "seller", "commitmentHash", "proofBundleHash", "passed", "checks", "aggregateUsage", "settlement", "verifier", "verifiedAt", "signature"],
    ["reportHash"],
    "VerificationReport"
  );
  assertVerificationReportBase(object, "VerificationReport");
  assertString(object.signature, "VerificationReport.signature");
}

function assertVerificationReportBase(object: Record<string, unknown>, label: string): void {
  assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.verificationReport, `${label}.schemaVersion`);
  assertUIntString(object.chainId, `${label}.chainId`);
  assertAddress(object.settlementContract, `${label}.settlementContract`);
  assertBytes32(object.taskId, `${label}.taskId`);
  assertAddress(object.buyer, `${label}.buyer`);
  assertAddress(object.seller, `${label}.seller`);
  assertBytes32(object.commitmentHash, `${label}.commitmentHash`);
  assertBytes32(object.proofBundleHash, `${label}.proofBundleHash`);
  assertBoolean(object.passed, `${label}.passed`);
  assertVerificationChecks(object.checks, `${label}.checks`);
  assertAggregateUsage(object.aggregateUsage, `${label}.aggregateUsage`);
  assertVerificationSettlement(object.settlement, `${label}.settlement`);
  assertVerificationOutcomeConsistency(object, label);
  assertAddress(object.verifier, `${label}.verifier`);
  assertUnixMillis(object.verifiedAt, `${label}.verifiedAt`);
  assertOptionalBytes32(object.reportHash, `${label}.reportHash`);
}

function assertProofBundleReceipts(object: ProofBundle): void {
  const seenCallIndices = new Set<number>();
  let totalReceiptTokens = 0;

  object.receipts.forEach((receipt, index) => {
    if (receipt.taskContext.taskId !== object.taskId) {
      throw new TypeError(`ProofBundle.receipts[${index}].taskContext.taskId must match ProofBundle.taskId.`);
    }

    if (receipt.taskContext.commitmentHash !== object.commitmentHash) {
      throw new TypeError(
        `ProofBundle.receipts[${index}].taskContext.commitmentHash must match ProofBundle.commitmentHash.`
      );
    }

    if (receipt.taskContext.seller !== object.seller) {
      throw new TypeError(`ProofBundle.receipts[${index}].taskContext.seller must match ProofBundle.seller.`);
    }

    if (seenCallIndices.has(receipt.callIndex)) {
      throw new TypeError(`ProofBundle.receipts[${index}].callIndex must be unique within the bundle.`);
    }

    seenCallIndices.add(receipt.callIndex);
    totalReceiptTokens += receipt.extracted.usage.totalTokens;
  });

  if (totalReceiptTokens !== object.aggregateUsage.totalTokens) {
    throw new TypeError("ProofBundle.aggregateUsage.totalTokens must equal the sum of receipt usage totals.");
  }
}

function assertVerificationOutcomeConsistency(object: Record<string, unknown>, label: string): void {
  const settlement = object.settlement as VerificationSettlement;
  const passed = object.passed as boolean;

  if (passed && settlement.action !== "RELEASE") {
    throw new TypeError(`${label}.settlement.action must be RELEASE when ${label}.passed is true.`);
  }

  if (!passed && settlement.action !== "REFUND") {
    throw new TypeError(`${label}.settlement.action must be REFUND when ${label}.passed is false.`);
  }
}

function assertCommitmentTarget(value: unknown, fieldName: string): asserts value is CommitmentTarget {
  const object = assertObject(value, fieldName);
  assertExactKeys(object, ["host", "path", "method"], [], fieldName);
  assertString(object.host, `${fieldName}.host`);
  assertString(object.path, `${fieldName}.path`);
  assertUppercaseString(object.method, `${fieldName}.method`);
}

function assertUsageThreshold(value: unknown, fieldName: string): asserts value is UsageThreshold {
  const object = assertObject(value, fieldName);
  assertExactKeys(object, ["totalTokens"], [], fieldName);
  assertSafeInteger(object.totalTokens, `${fieldName}.totalTokens`, { min: 0 });
}

function assertExtractedReceiptFields(value: unknown, fieldName: string): asserts value is ExtractedReceiptFields {
  const object = assertObject(value, fieldName);
  assertExactKeys(object, ["model", "usage"], [], fieldName);
  assertString(object.model, `${fieldName}.model`);
  assertReceiptUsage(object.usage, `${fieldName}.usage`);
}

function assertReceiptUsage(value: unknown, fieldName: string): asserts value is ReceiptUsage {
  const object = assertObject(value, fieldName);
  assertExactKeys(object, ["totalTokens"], [], fieldName);
  assertSafeInteger(object.totalTokens, `${fieldName}.totalTokens`, { min: 0 });
}

function assertAggregateUsage(value: unknown, fieldName: string): asserts value is AggregateUsage {
  const object = assertObject(value, fieldName);
  assertExactKeys(object, ["totalTokens"], [], fieldName);
  assertSafeInteger(object.totalTokens, `${fieldName}.totalTokens`, { min: 0 });
}

function assertVerificationChecks(value: unknown, fieldName: string): asserts value is VerificationChecks {
  const object = assertObject(value, fieldName);
  const entries = Object.entries(object);

  if (entries.length === 0) {
    throw new TypeError(`${fieldName} must include at least one check.`);
  }

  for (const [key, nestedValue] of entries) {
    if (!key) {
      throw new TypeError(`${fieldName} keys must be non-empty.`);
    }

    assertBoolean(nestedValue, `${fieldName}.${key}`);
  }
}

function assertVerificationSettlement(value: unknown, fieldName: string): asserts value is VerificationSettlement {
  const object = assertObject(value, fieldName);
  assertExactKeys(object, ["action", "amount"], [], fieldName);

  if (object.action !== "RELEASE" && object.action !== "REFUND") {
    throw new TypeError(`${fieldName}.action must be RELEASE or REFUND.`);
  }

  assertUIntString(object.amount, `${fieldName}.amount`);
}

function assertAddress(value: unknown, fieldName: string): asserts value is Address {
  if (!isAddress(value)) {
    throw new TypeError(`${fieldName} must be a lowercase 0x-prefixed 20-byte hex string.`);
  }
}

function assertBytes32(value: unknown, fieldName: string): asserts value is Bytes32 {
  if (!isBytes32(value)) {
    throw new TypeError(`${fieldName} must be a lowercase 0x-prefixed 32-byte hex string.`);
  }
}

function assertUIntString(value: unknown, fieldName: string): asserts value is UIntString {
  if (!isUIntString(value)) {
    throw new TypeError(`${fieldName} must be an unsigned base-10 integer string.`);
  }
}

function assertUnixMillis(value: unknown, fieldName: string): asserts value is UnixMillis {
  if (!isUnixMillis(value)) {
    throw new TypeError(`${fieldName} must be an unsigned base-10 millisecond timestamp string.`);
  }
}

function assertOptionalBytes32(value: unknown, fieldName: string): void {
  if (value !== undefined) {
    assertBytes32(value, fieldName);
  }
}

function assertOptionalString(value: unknown, fieldName: string): void {
  if (value !== undefined) {
    assertString(value, fieldName);
  }
}

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
}

function assertUppercaseString(value: unknown, fieldName: string): asserts value is string {
  assertString(value, fieldName);

  if (value !== value.toUpperCase()) {
    throw new TypeError(`${fieldName} must be uppercase.`);
  }
}

function assertStringArray(value: unknown, fieldName: string, options: { minLength?: number } = {}): asserts value is string[] {
  assertArray(value, fieldName, options);
  value.forEach((item, index) => assertString(item, `${fieldName}[${index}]`));
}

function assertArray(value: unknown, fieldName: string, options: { minLength?: number } = {}): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    throw new TypeError(`${fieldName} must contain at least ${options.minLength} item(s).`);
  }
}

function assertBoolean(value: unknown, fieldName: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${fieldName} must be a boolean.`);
  }
}

function assertSafeInteger(
  value: unknown,
  fieldName: string,
  options: {
    min?: number;
  } = {}
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${fieldName} must be a safe integer.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new TypeError(`${fieldName} must be >= ${options.min}.`);
  }
}

function assertLiteral<T>(value: unknown, expected: T, fieldName: string): asserts value is T {
  if (value !== expected) {
    throw new TypeError(`${fieldName} must equal ${String(expected)}.`);
  }
}

function assertExactKeys(
  object: Record<string, unknown>,
  requiredKeys: string[],
  optionalKeys: string[],
  fieldName: string
): void {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const requiredKey of requiredKeys) {
    if (!hasOwn(object, requiredKey)) {
      throw new TypeError(`${fieldName}.${requiredKey} is required.`);
    }
  }

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`${fieldName}.${key} is not allowed.`);
    }
  }
}

function assertObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`${fieldName} must be a plain object.`);
  }

  return value;
}

function getSchemaVersion(value: unknown): string {
  const object = assertObject(value, "ProtocolObject");

  if (typeof object.schemaVersion !== "string" || object.schemaVersion.length === 0) {
    throw new TypeError("ProtocolObject.schemaVersion must be a non-empty string.");
  }

  return object.schemaVersion;
}

function hasOwn(value: unknown, key: string): boolean {
  return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
