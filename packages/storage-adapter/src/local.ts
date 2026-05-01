import type { StorageProvider } from "./core.js";

/**
 * Local (file-system-style) storage adapter.
 *
 * Phase 1 uses an in-memory `Map` as the backing store — functionally
 * identical to `MemoryStorage` but semantically distinct: this class is
 * designed for scenarios where data would eventually be persisted to the
 * file system.
 *
 * The optional `basePath` parameter is accepted now so callers can prepare
 * for the future file-system implementation without changing their code.
 *
 * Usage:
 * ```ts
 * const store = new LocalStorage({ basePath: "/tmp/fulfillpay" });
 * await store.store("key", { foo: 1 });
 * ```
 */
export interface LocalStorageOptions {
  /** Directory root for file-system persistence (reserved for future use). */
  basePath?: string;
}

export class LocalStorage implements StorageProvider {
  private readonly map = new Map<string, string>();
  private readonly basePath: string | undefined;

  constructor(options?: LocalStorageOptions) {
    this.basePath = options?.basePath;
  }

  async store(key: string, data: unknown): Promise<void> {
    // TODO: Replace with fs.writeFile when migrating to real file-system storage.
    this.map.set(key, JSON.stringify(data));
  }

  async retrieve<T = unknown>(key: string): Promise<T | null> {
    // TODO: Replace with fs.readFile when migrating to real file-system storage.
    const raw = this.map.get(key);
    if (raw === undefined) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async delete(key: string): Promise<void> {
    // TODO: Replace with fs.unlink when migrating to real file-system storage.
    this.map.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    // TODO: Replace with fs.access when migrating to real file-system storage.
    return this.map.has(key);
  }

  async list(prefix?: string): Promise<string[]> {
    // TODO: Replace with fs.readdir + prefix filtering when migrating to real file-system storage.
    const keys = Array.from(this.map.keys());
    if (prefix === undefined || prefix === "") {
      return keys;
    }
    return keys.filter((k) => k.startsWith(prefix));
  }
}
