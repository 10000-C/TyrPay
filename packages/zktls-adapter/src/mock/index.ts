import { keccak256, randomBytes, toUtf8Bytes } from "ethers";
import type { HexString } from "@fulfillpay/sdk-core";

import type { ZkTLSProvider, ZkTLSRequest, ZkTLSResult } from "../core/index.js";

/**
 * Mock zkTLS provider for local development and testing.
 *
 * Generates syntactically-valid but cryptographically-meaningless proofs.
 * All verifications succeed unconditionally. Do NOT use in production.
 */
export class MockZkTLS implements ZkTLSProvider {
  /**
   * Generate a fake zkTLS proof.
   *
   * The proof is 64 random bytes. Public signals include a synthetic
   * receiptHash and a requestHash so that downstream consumers can
   * exercise their logic without a real zkTLS backend.
   */
  async generateProof(request: ZkTLSRequest): Promise<ZkTLSResult> {
    // Simulate async work
    await Promise.resolve();

    // receiptHash = keccak256(url + method + timestamp) as a simple simulation
    const timestamp = Date.now().toString();
    const receiptHash = keccak256(
      toUtf8Bytes(request.url + request.method + timestamp)
    ) as HexString;

    // requestHash = keccak256(url + method) to identify the request
    const requestHash = keccak256(
      toUtf8Bytes(request.url + request.method)
    ) as HexString;

    // Fake proof: 64 bytes of random data
    const proof = `0x${Buffer.from(randomBytes(64)).toString("hex")}` as HexString;

    // Simulated public signals
    const publicSignals: HexString[] = [receiptHash, requestHash];

    return {
      proof,
      publicSignals,
      receiptHash,
    };
  }

  /**
   * Verify a zkTLS proof.
   *
   * In mock mode ALL proofs are accepted. This lets integration tests
   * proceed without a real verification backend.
   */
  async verifyProof(
    _proof: HexString,
    _publicSignals: HexString[]
  ): Promise<boolean> {
    // Simulate async work
    await Promise.resolve();
    return true;
  }
}
