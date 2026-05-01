import type { HexString } from "@fulfillpay/sdk-core";

/**
 * zkTLS provider interface for proof generation and verification.
 *
 * Implementations wrap specific zkTLS backends (Reclaim Protocol, etc.)
 * to generate cryptographic proofs that a particular HTTPS response was
 * returned by a given server, without revealing sensitive request data.
 */
export interface ZkTLSProvider {
  generateProof(request: ZkTLSRequest): Promise<ZkTLSResult>;
  verifyProof(proof: HexString, publicSignals: HexString[]): Promise<boolean>;
}

/** Request to generate a zkTLS proof for an API call. */
export interface ZkTLSRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  responseMatches: ResponseMatch[];
}

/** Specification of which response bytes to prove. */
export interface ResponseMatch {
  /** Start position in the response body. */
  index: number;
  /** Number of bytes to extract starting from `index`. */
  length: number;
}

/** Result of zkTLS proof generation. */
export interface ZkTLSResult {
  /** The zkTLS proof bytes. */
  proof: HexString;
  /** Public signals accompanying the proof. */
  publicSignals: HexString[];
  /** Hash of the response data covered by the proof. */
  receiptHash: HexString;
}
