import { assertProtocolObject } from "../types/index.js";
export function canonicalize(input) {
    return JSON.stringify(toCanonicalJsonValue(input));
}
export function toCanonicalJsonValue(input) {
    if (isProtocolSchemaObject(input)) {
        assertProtocolObject(input);
    }
    return normalizeValue(input, "$");
}
function normalizeValue(input, path) {
    if (typeof input === "string" || typeof input === "boolean") {
        return input;
    }
    if (typeof input === "number") {
        if (!Number.isFinite(input) || !Number.isSafeInteger(input)) {
            throw new TypeError(`${path} must be a finite safe integer.`);
        }
        return input;
    }
    if (input === null) {
        throw new TypeError(`${path} must not be null.`);
    }
    if (typeof input === "bigint") {
        throw new TypeError(`${path} must not be a bigint; use a decimal string.`);
    }
    if (typeof input === "undefined" || typeof input === "function" || typeof input === "symbol") {
        throw new TypeError(`${path} is not JSON-serializable.`);
    }
    if (Array.isArray(input)) {
        return input.map((item, index) => normalizeValue(item, `${path}[${index}]`));
    }
    if (!isPlainObject(input)) {
        throw new TypeError(`${path} must be a plain object.`);
    }
    const normalizedEntries = Object.entries(input).map(([key, value]) => {
        if (typeof value === "undefined") {
            throw new TypeError(`${path}.${key} must not be undefined.`);
        }
        return [key, normalizeValue(value, `${path}.${key}`)];
    });
    normalizedEntries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return Object.fromEntries(normalizedEntries);
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
