export const PROTOCOL_NAME = "FulfillPay";
export const PROTOCOL_VERSION = 1;
export const EIP712_DOMAIN_NAME = "FulfillPay";
export const EIP712_DOMAIN_VERSION = "1";
export const SCHEMA_VERSIONS = {
    taskIntent: "fulfillpay.task-intent.v1",
    taskContext: "fulfillpay.task-context.v1",
    executionCommitment: "fulfillpay.execution-commitment.v1",
    callIntent: "fulfillpay.call-intent.v1",
    deliveryReceipt: "fulfillpay.delivery-receipt.v1",
    proofBundle: "fulfillpay.proof-bundle.v1",
    verificationReport: "fulfillpay.verification-report.v1"
};
export const SETTLEMENT_ACTION_CODES = {
    RELEASE: 1,
    REFUND: 2
};
const ADDRESS_LENGTH = 42;
const BYTES32_LENGTH = 66;
const HEX_BODY_PATTERN = /^[0-9a-f]+$/;
const UINT_STRING_PATTERN = /^(0|[1-9][0-9]*)$/;
export function isAddress(value) {
    return typeof value === "string" && value.length === ADDRESS_LENGTH && value.startsWith("0x") && HEX_BODY_PATTERN.test(value.slice(2));
}
export function isBytes32(value) {
    return typeof value === "string" && value.length === BYTES32_LENGTH && value.startsWith("0x") && HEX_BODY_PATTERN.test(value.slice(2));
}
export function isUIntString(value) {
    return typeof value === "string" && UINT_STRING_PATTERN.test(value);
}
export function isUnixMillis(value) {
    return isUIntString(value);
}
export function isProtocolObject(value) {
    try {
        assertProtocolObject(value);
        return true;
    }
    catch {
        return false;
    }
}
export function normalizeAddress(value, fieldName = "address") {
    const normalized = value.toLowerCase();
    assertAddress(normalized, fieldName);
    return normalized;
}
export function normalizeBytes32(value, fieldName = "bytes32") {
    const normalized = value.toLowerCase();
    assertBytes32(normalized, fieldName);
    return normalized;
}
export function normalizeUIntString(value, fieldName = "uint") {
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
export function settlementActionToCode(action) {
    return SETTLEMENT_ACTION_CODES[action];
}
export function buildTaskContext(input) {
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
export function buildCallIntent(input) {
    const callIntent = {
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
export function assertProtocolObject(value) {
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
export function assertTaskIntent(value) {
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
export function assertTaskContext(value) {
    const object = assertObject(value, "TaskContext");
    assertExactKeys(object, ["schemaVersion", "protocol", "version", "chainId", "settlementContract", "taskId", "taskNonce", "commitmentHash", "buyer", "seller"], [], "TaskContext");
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
export function assertExecutionCommitment(value) {
    const object = assertObject(value, "ExecutionCommitment");
    assertExactKeys(object, ["schemaVersion", "taskId", "buyer", "seller", "target", "allowedModels", "minUsage", "deadline", "verifier"], ["termsHash", "termsURI"], "ExecutionCommitment");
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
export function assertCallIntent(value) {
    const object = assertObject(value, "CallIntent");
    assertExactKeys(object, ["schemaVersion", "taskContextHash", "callIndex", "host", "path", "method", "declaredModel", "requestBodyHash"], [], "CallIntent");
    assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.callIntent, "CallIntent.schemaVersion");
    assertBytes32(object.taskContextHash, "CallIntent.taskContextHash");
    assertSafeInteger(object.callIndex, "CallIntent.callIndex", { min: 0 });
    assertString(object.host, "CallIntent.host");
    assertString(object.path, "CallIntent.path");
    assertUppercaseString(object.method, "CallIntent.method");
    assertString(object.declaredModel, "CallIntent.declaredModel");
    assertBytes32(object.requestBodyHash, "CallIntent.requestBodyHash");
}
export function assertDeliveryReceipt(value) {
    const object = assertObject(value, "DeliveryReceipt");
    assertExactKeys(object, ["schemaVersion", "taskContext", "callIndex", "callIntentHash", "provider", "providerProofId", "requestHash", "responseHash", "observedAt", "extracted", "rawProofHash", "rawProofURI"], [], "DeliveryReceipt");
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
export function assertProofBundle(value) {
    const object = assertObject(value, "ProofBundle");
    assertExactKeys(object, ["schemaVersion", "taskId", "commitmentHash", "seller", "receipts", "aggregateUsage", "createdAt"], [], "ProofBundle");
    assertLiteral(object.schemaVersion, SCHEMA_VERSIONS.proofBundle, "ProofBundle.schemaVersion");
    assertBytes32(object.taskId, "ProofBundle.taskId");
    assertBytes32(object.commitmentHash, "ProofBundle.commitmentHash");
    assertAddress(object.seller, "ProofBundle.seller");
    assertArray(object.receipts, "ProofBundle.receipts", { minLength: 1 });
    object.receipts.forEach((receipt) => assertDeliveryReceipt(receipt));
    assertAggregateUsage(object.aggregateUsage, "ProofBundle.aggregateUsage");
    assertUnixMillis(object.createdAt, "ProofBundle.createdAt");
    assertProofBundleReceipts(object);
}
export function assertUnsignedVerificationReport(value) {
    const object = assertObject(value, "UnsignedVerificationReport");
    assertExactKeys(object, ["schemaVersion", "chainId", "settlementContract", "taskId", "buyer", "seller", "commitmentHash", "proofBundleHash", "passed", "checks", "aggregateUsage", "settlement", "verifier", "verifiedAt"], ["reportHash"], "UnsignedVerificationReport");
    assertVerificationReportBase(object, "UnsignedVerificationReport");
    if (hasOwn(object, "signature")) {
        throw new TypeError("UnsignedVerificationReport.signature must be absent.");
    }
}
export function assertVerificationReport(value) {
    const object = assertObject(value, "VerificationReport");
    assertExactKeys(object, ["schemaVersion", "chainId", "settlementContract", "taskId", "buyer", "seller", "commitmentHash", "proofBundleHash", "passed", "checks", "aggregateUsage", "settlement", "verifier", "verifiedAt", "signature"], ["reportHash"], "VerificationReport");
    assertVerificationReportBase(object, "VerificationReport");
    assertString(object.signature, "VerificationReport.signature");
}
function assertVerificationReportBase(object, label) {
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
function assertProofBundleReceipts(object) {
    const seenCallIndices = new Set();
    let totalReceiptTokens = 0;
    object.receipts.forEach((receipt, index) => {
        if (receipt.taskContext.taskId !== object.taskId) {
            throw new TypeError(`ProofBundle.receipts[${index}].taskContext.taskId must match ProofBundle.taskId.`);
        }
        if (receipt.taskContext.commitmentHash !== object.commitmentHash) {
            throw new TypeError(`ProofBundle.receipts[${index}].taskContext.commitmentHash must match ProofBundle.commitmentHash.`);
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
function assertVerificationOutcomeConsistency(object, label) {
    const settlement = object.settlement;
    const passed = object.passed;
    if (passed && settlement.action !== "RELEASE") {
        throw new TypeError(`${label}.settlement.action must be RELEASE when ${label}.passed is true.`);
    }
    if (!passed && settlement.action !== "REFUND") {
        throw new TypeError(`${label}.settlement.action must be REFUND when ${label}.passed is false.`);
    }
}
function assertCommitmentTarget(value, fieldName) {
    const object = assertObject(value, fieldName);
    assertExactKeys(object, ["host", "path", "method"], [], fieldName);
    assertString(object.host, `${fieldName}.host`);
    assertString(object.path, `${fieldName}.path`);
    assertUppercaseString(object.method, `${fieldName}.method`);
}
function assertUsageThreshold(value, fieldName) {
    const object = assertObject(value, fieldName);
    assertExactKeys(object, ["totalTokens"], [], fieldName);
    assertSafeInteger(object.totalTokens, `${fieldName}.totalTokens`, { min: 0 });
}
function assertExtractedReceiptFields(value, fieldName) {
    const object = assertObject(value, fieldName);
    assertExactKeys(object, ["model", "usage"], [], fieldName);
    assertString(object.model, `${fieldName}.model`);
    assertReceiptUsage(object.usage, `${fieldName}.usage`);
}
function assertReceiptUsage(value, fieldName) {
    const object = assertObject(value, fieldName);
    assertExactKeys(object, ["totalTokens"], [], fieldName);
    assertSafeInteger(object.totalTokens, `${fieldName}.totalTokens`, { min: 0 });
}
function assertAggregateUsage(value, fieldName) {
    const object = assertObject(value, fieldName);
    assertExactKeys(object, ["totalTokens"], [], fieldName);
    assertSafeInteger(object.totalTokens, `${fieldName}.totalTokens`, { min: 0 });
}
function assertVerificationChecks(value, fieldName) {
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
function assertVerificationSettlement(value, fieldName) {
    const object = assertObject(value, fieldName);
    assertExactKeys(object, ["action", "amount"], [], fieldName);
    if (object.action !== "RELEASE" && object.action !== "REFUND") {
        throw new TypeError(`${fieldName}.action must be RELEASE or REFUND.`);
    }
    assertUIntString(object.amount, `${fieldName}.amount`);
}
function assertAddress(value, fieldName) {
    if (!isAddress(value)) {
        throw new TypeError(`${fieldName} must be a lowercase 0x-prefixed 20-byte hex string.`);
    }
}
function assertBytes32(value, fieldName) {
    if (!isBytes32(value)) {
        throw new TypeError(`${fieldName} must be a lowercase 0x-prefixed 32-byte hex string.`);
    }
}
function assertUIntString(value, fieldName) {
    if (!isUIntString(value)) {
        throw new TypeError(`${fieldName} must be an unsigned base-10 integer string.`);
    }
}
function assertUnixMillis(value, fieldName) {
    if (!isUnixMillis(value)) {
        throw new TypeError(`${fieldName} must be an unsigned base-10 millisecond timestamp string.`);
    }
}
function assertOptionalBytes32(value, fieldName) {
    if (value !== undefined) {
        assertBytes32(value, fieldName);
    }
}
function assertOptionalString(value, fieldName) {
    if (value !== undefined) {
        assertString(value, fieldName);
    }
}
function assertString(value, fieldName) {
    if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(`${fieldName} must be a non-empty string.`);
    }
}
function assertUppercaseString(value, fieldName) {
    assertString(value, fieldName);
    if (value !== value.toUpperCase()) {
        throw new TypeError(`${fieldName} must be uppercase.`);
    }
}
function assertStringArray(value, fieldName, options = {}) {
    assertArray(value, fieldName, options);
    value.forEach((item, index) => assertString(item, `${fieldName}[${index}]`));
}
function assertArray(value, fieldName, options = {}) {
    if (!Array.isArray(value)) {
        throw new TypeError(`${fieldName} must be an array.`);
    }
    if (options.minLength !== undefined && value.length < options.minLength) {
        throw new TypeError(`${fieldName} must contain at least ${options.minLength} item(s).`);
    }
}
function assertBoolean(value, fieldName) {
    if (typeof value !== "boolean") {
        throw new TypeError(`${fieldName} must be a boolean.`);
    }
}
function assertSafeInteger(value, fieldName, options = {}) {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw new TypeError(`${fieldName} must be a safe integer.`);
    }
    if (options.min !== undefined && value < options.min) {
        throw new TypeError(`${fieldName} must be >= ${options.min}.`);
    }
}
function assertLiteral(value, expected, fieldName) {
    if (value !== expected) {
        throw new TypeError(`${fieldName} must equal ${String(expected)}.`);
    }
}
function assertExactKeys(object, requiredKeys, optionalKeys, fieldName) {
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
function assertObject(value, fieldName) {
    if (!isPlainObject(value)) {
        throw new TypeError(`${fieldName} must be a plain object.`);
    }
    return value;
}
function getSchemaVersion(value) {
    const object = assertObject(value, "ProtocolObject");
    if (typeof object.schemaVersion !== "string" || object.schemaVersion.length === 0) {
        throw new TypeError("ProtocolObject.schemaVersion must be a non-empty string.");
    }
    return object.schemaVersion;
}
function hasOwn(value, key) {
    return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}
function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
