import type { StorageProvider } from "./core.js";

/**
 * In-memory storage adapter backed by a plain `Map`.
 *
 * Data is serialised as JSON strings so that round-tripping preserves
 * structured types (numbers, booleans, nested objects, …).
 *
 * Usage:
 * ```ts
 * const store = new MemoryStorage();
 * await store.store("key", { foo: 1 });
 * const val = await store.retrieve<{ foo: number }>("key");
 * ```
 */
export class MemoryStorage implements StorageProvider {
  private readonly map = new Map<string, string>();

  async store(key: string, data: unknown): Promise<void> {
    this.map.set(key, JSON.stringify(data));
  }

  async retrieve<T = unknown>(key: string): Promise<T | null> {
    const raw = this.map.get(key);
    if (raw === undefined) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.map.has(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.map.keys());
    if (prefix === undefined || prefix === "") {
      return keys;
    }
    return keys.filter((k) => k.startsWith(prefix));
  }
}
