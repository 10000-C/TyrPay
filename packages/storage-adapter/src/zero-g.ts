import type { StorageProvider } from "./core.js";

/**
 * Configuration for the 0G decentralised storage adapter.
 *
 * Phase 1 ignores these values and uses an in-memory `Map` as a mock.
 * When the real 0G SDK is integrated these options will be passed through.
 */
export interface ZeroGStorageConfig {
  /** 0G storage node endpoint (e.g. "https://rpc.0g.ai"). */
  endpoint?: string;
  /** Optional API key or authentication token. */
  apiKey?: string;
  /** Network identifier. */
  network?: string;
}

/**
 * Mock 0G (Zero Gravity) decentralised storage adapter.
 *
 * This class implements the full `StorageProvider` interface but currently
 * stores everything in memory.  It simulates a transaction hash on `store`
 * to mirror the behaviour of the real 0G SDK.
 *
 * TODO: Integrate the real 0G SDK for production use:
 *   - Replace `store` with an actual 0G upload call.
 *   - Replace `retrieve` with an actual 0G download call.
 *   - Replace `delete` / `exists` / `list` with on-chain or indexer queries.
 */
export class ZeroGStorage implements StorageProvider {
  private readonly map = new Map<string, string>();
  private readonly config: ZeroGStorageConfig;

  constructor(config?: ZeroGStorageConfig) {
    this.config = config ?? {};
  }

  async store(key: string, data: unknown): Promise<void> {
    const serialized = JSON.stringify(data);

    // Simulate a 0G transaction hash for the stored blob.
    // In production this would be the real tx hash returned by the 0G SDK.
    const payload = `zerog:${key}:${Date.now()}`;
    const hex = Array.from(payload)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    const txHash = `0x${hex}`;

    // Store both the data and the mock tx hash so we can return it later if needed.
    this.map.set(key, JSON.stringify({ __zerog_txHash: txHash, __zerog_data: serialized }));
  }

  async retrieve<T = unknown>(key: string): Promise<T | null> {
    const raw = this.map.get(key);
    if (raw === undefined) {
      return null;
    }

    // Unwrap the mock envelope and return the original data.
    const envelope = JSON.parse(raw) as { __zerog_txHash: string; __zerog_data: string };
    return JSON.parse(envelope.__zerog_data) as T;
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
