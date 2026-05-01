import type { HexString } from "@fulfillpay/sdk-core";

import type { ZkTLSProvider, ZkTLSRequest, ZkTLSResult } from "../core/index.js";

/** Configuration for the Reclaim Protocol zkTLS adapter. */
export interface ReclaimConfig {
  /** Reclaim application ID. */
  appId: string;
  /** Reclaim application secret (optional for verification-only usage). */
  appSecret?: string;
  /** Custom Reclaim provider WebSocket URL (defaults to Reclaim hosted endpoint). */
  providerUrl?: string;
}

/**
 * Reclaim Protocol zkTLS adapter — stub implementation.
 *
 * This class preserves the full interface signature so that consumers can
 * code against it and type-check succeeds, but every method currently
 * throws because the actual Reclaim SDK integration is pending.
 *
 * ## TODO — Integration roadmap
 *
 * 1. **Add `@reclaimprotocol/reclaim-sdk-js` (or equivalent) as a dependency.**
 *    ```
 *    pnpm add @reclaimprotocol/reclaim-sdk-js
 *    ```
 *
 * 2. **`generateProof` implementation sketch:**
 *    - Instantiate `Reclaim.ProofRequest` with `appId` and `appSecret`.
 *    - Call `proofRequest.setParams({ url, method, responseMatches })`.
 *    - Submit the proof request to the Reclaim WebSocket provider.
 *    - Wait for the callback that contains the zkTLS proof + public signals.
 *    - Map the Reclaim proof fields to our `ZkTLSResult` interface.
 *
 * 3. **`verifyProof` implementation sketch:**
 *    - Use `Reclaim.verifySignedProof(proof)` to check on-chain or off-chain.
 *    - Alternatively, call the Reclaim verification REST endpoint.
 *    - Return the boolean verification result.
 *
 * 4. **Error handling:**
 *    - Wrap Reclaim SDK errors in a custom `ZkTLSError` type.
 *    - Handle timeout / connection failures gracefully.
 *
 * 5. **Testing:**
 *    - Add integration tests against the Reclaim testnet / sandbox.
 *    - Use `@reclaimprotocol/reclaim-sdk-test-utils` if available.
 */
export class ReclaimZkTLS implements ZkTLSProvider {
  private readonly config: ReclaimConfig;

  constructor(config: ReclaimConfig) {
    this.config = config;
  }

  /**
   * Generate a zkTLS proof via Reclaim Protocol.
   *
   * @throws {Error} Always — Reclaim SDK integration is pending.
   */
  async generateProof(_request: ZkTLSRequest): Promise<ZkTLSResult> {
    void this.config; // referenced so the field is not flagged as unused
    throw new Error(
      "Not implemented - Reclaim SDK integration pending"
    );
  }

  /**
   * Verify a zkTLS proof via Reclaim Protocol.
   *
   * @throws {Error} Always — Reclaim SDK integration is pending.
   */
  async verifyProof(
    _proof: HexString,
    _publicSignals: HexString[]
  ): Promise<boolean> {
    throw new Error("Not implemented");
  }
}
