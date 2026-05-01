/**
 * JSON Canonicalization for FulFilPay protocol objects.
 *
 * Produces deterministic JSON by:
 * 1. Sorting object keys lexicographically (by Unicode code point)
 * 2. Serializing with no insignificant whitespace
 * 3. Preserving array order
 *
 * This satisfies the protocol's canonical JSON rules defined in
 * docs/protocol/canonicalization-and-hashing.md:
 *   - Object key order: sort keys lexicographically by Unicode code point
 *   - Arrays: preserve array order
 *   - No undefined values
 *   - No insignificant whitespace
 */

/**
 * Recursively sort object keys lexicographically and return a new object.
 * Arrays are preserved in their original order; their element objects are also sorted.
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = sortObjectKeys(record[key]);
    }
    return result;
  }

  return obj;
}

/**
 * Canonicalize an object to a deterministic JSON string.
 *
 * Algorithm:
 * 1. Deep-sort all object keys lexicographically
 * 2. JSON.stringify with no replacer and no whitespace
 *
 * This produces output identical to the test vector canonical strings.
 * For example, the task-intent.basic fixture canonical:
 *   {"amount":"1000000","buyer":"0x1111...","deadline":"1735689600000",...}
 *
 * @param obj - Any JSON-serializable value (object, array, primitive)
 * @returns Deterministic JSON string with sorted keys and no whitespace
 */
export function canonicalize(obj: unknown): string {
  const sorted = sortObjectKeys(obj);
  return JSON.stringify(sorted);
}
