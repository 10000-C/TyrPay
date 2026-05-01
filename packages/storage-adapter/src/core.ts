/**
 * Storage adapter interface for persisting protocol objects.
 *
 * All storage backends (memory, local, 0G) implement this interface
 * so consumers can swap providers without changing logic.
 */
export interface StorageProvider {
  /**
   * Persist data under the given key.
   * The value is serialized to JSON internally.
   */
  store(key: string, data: unknown): Promise<void>;

  /**
   * Retrieve data previously stored under the given key.
   * Returns `null` when the key does not exist.
   */
  retrieve<T = unknown>(key: string): Promise<T | null>;

  /**
   * Remove the entry for the given key.
   * No-op when the key does not exist.
   */
  delete(key: string): Promise<void>;

  /**
   * Check whether an entry exists for the given key.
   */
  exists(key: string): Promise<boolean>;

  /**
   * List stored keys, optionally filtered by a prefix.
   * When `prefix` is provided only keys that start with it are returned.
   * Returns all keys when no prefix is given.
   */
  list(prefix?: string): Promise<string[]>;
}
