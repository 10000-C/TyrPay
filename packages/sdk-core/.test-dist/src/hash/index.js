import { keccak256, toUtf8Bytes } from "ethers";
import { canonicalize } from "../canonicalize/index.js";
import { assertCallIntent, assertDeliveryReceipt, assertExecutionCommitment, assertProofBundle, assertProtocolObject, assertTaskContext, assertTaskIntent, assertUnsignedVerificationReport, buildCallIntent, buildTaskContext } from "../types/index.js";
export function hashObject(input, options = {}) {
    const normalized = omitTopLevelKeys(input, options.excludeTopLevelKeys);
    if (isProtocolSchemaObject(normalized)) {
        assertProtocolObject(normalized);
    }
    return keccak256(toUtf8Bytes(canonicalize(normalized)));
}
export function hashTaskIntent(input) {
    assertTaskIntent(input);
    return hashObject(input);
}
export function hashTaskContext(input) {
    assertTaskContext(input);
    return hashObject(input);
}
export function buildTaskContextHash(input) {
    return hashTaskContext(buildTaskContext(input));
}
export function hashExecutionCommitment(input) {
    assertExecutionCommitment(input);
    return hashObject(input);
}
export function hashCallIntent(input) {
    assertCallIntent(input);
    return hashObject(input);
}
export function buildCallIntentHash(input) {
    const taskContext = isTaskContext(input.taskContext) ? input.taskContext : buildTaskContext(input.taskContext);
    return hashCallIntent(buildCallIntent({
        taskContextHash: hashTaskContext(taskContext),
        callIndex: input.callIndex,
        host: input.host,
        path: input.path,
        method: input.method,
        declaredModel: input.declaredModel,
        requestBodyHash: input.requestBodyHash
    }));
}
export function hashDeliveryReceipt(input) {
    assertDeliveryReceipt(input);
    return hashObject(input);
}
export function hashProofBundle(input) {
    assertProofBundle(input);
    return hashObject(input);
}
export function hashVerificationReport(input) {
    const unsignedReport = toUnsignedVerificationReport(input);
    assertUnsignedVerificationReport(unsignedReport);
    return hashObject(unsignedReport, { excludeTopLevelKeys: ["reportHash", "signature"] });
}
function omitTopLevelKeys(input, excludedKeys) {
    if (!excludedKeys || excludedKeys.length === 0 || !isPlainObject(input)) {
        return input;
    }
    const omitted = new Set(excludedKeys);
    return Object.fromEntries(Object.entries(input).filter(([key]) => !omitted.has(key)));
}
function isTaskContext(value) {
    return isProtocolSchemaObject(value);
}
function toUnsignedVerificationReport(report) {
    const { signature: _signature, ...unsignedReport } = report;
    return unsignedReport;
}
function isProtocolSchemaObject(value) {
    return isPlainObject(value) && typeof value.schemaVersion === "string" && value.schemaVersion.startsWith("fulfillpay.");
}
function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
