/**
 * FulFilPay Protocol Type Definitions
 *
 * All protocol object types for the FulFilPay settlement protocol.
 * Aligned with docs/protocol/protocol-objects.md and contract structs.
 *
 * Common conventions:
 * - Address: lowercase 0x-prefixed 20-byte hex string
 * - Bytes32: lowercase 0x-prefixed 32-byte hex string
 * - UIntString: base-10 unsigned integer string
 * - UnixMillis: base-10 millisecond timestamp string
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A 0x-prefixed hex string (addresses, hashes, byte arrays) */
export type HexString = `0x${string}`;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Task settlement state — matches contract enum `TaskStatus`.
 *
 * NOTE: The numeric values MUST match the Solidity enum ordering:
 *   0 = INTENT_CREATED
 *   1 = COMMITMENT_SUBMITTED
 *   2 = FUNDED
 *   3 = PROOF_SUBMITTED
 *   4 = SETTLED
 *   5 = REFUNDED
 */
export enum SettlementState {
  INTENT_CREATED = 0,
  COMMITMENT_SUBMITTED = 1,
  FUNDED = 2,
  PROOF_SUBMITTED = 3,
  SETTLED = 4,
  REFUNDED = 5,
}

/**
 * Settlement action values — matches contract constants.
 *
 *   1 = RELEASE  (escrow released to seller)
 *   2 = REFUND   (escrow returned to buyer)
 */
export enum SettlementAction {
  RELEASE = 1,
  REFUND = 2,
}

// ---------------------------------------------------------------------------
// Protocol Objects (canonical JSON / off-chain)
// ---------------------------------------------------------------------------

/**
 * TaskIntent — created by Buyer and materialized by the settlement contract.
 * Fixture: test/fixtures/protocol/task-intents/task-intent.basic.json
 */
export interface TaskIntent {
  schemaVersion: string;       // "fulfillpay.task-intent.v1"
  buyer: HexString;            // Address
  seller: HexString;           // Address
  token: HexString;            // Address (ERC-20)
  amount: string;              // UIntString — escrow amount in base units
  deadline: string;            // UnixMillis
  metadataHash?: HexString;    // Bytes32 — optional
  metadataURI?: string;        // URI — optional
}

/**
 * TaskContext — bound into every proof context and call intent.
 * Fixture: test/fixtures/protocol/task-contexts/task-context.basic.json
 */
export interface TaskContext {
  schemaVersion: string;       // "fulfillpay.task-context.v1"
  protocol: string;            // "FulfillPay"
  version: number;             // 1
  chainId: string;             // UIntString
  settlementContract: HexString; // Address
  taskId: HexString;           // Bytes32
  taskNonce: HexString;        // Bytes32
  commitmentHash: HexString;   // Bytes32
  buyer: HexString;            // Address
  seller: HexString;           // Address
}

/**
 * ExecutionCommitment — Seller's promise about what will be called and proven.
 * Fixture: test/fixtures/protocol/commitments/commitment.openai-compatible.json
 */
export interface ExecutionCommitment {
  schemaVersion: string;       // "fulfillpay.execution-commitment.v1"
  taskId: HexString;           // Bytes32
  buyer: HexString;            // Address
  seller: HexString;           // Address
  target: {
    host: string;
    path: string;
    method: string;
  };
  allowedModels: string[];
  minUsage: {
    totalTokens: number;
  };
  deadline: string;            // UnixMillis
  verifier: HexString;         // Address
  termsHash?: HexString;       // Bytes32 — optional
  termsURI?: string;           // URI — optional
}

/**
 * CallIntent — normalized description of one API call.
 * Fixture: test/fixtures/protocol/call-intents/call-intent.basic.json
 */
export interface CallIntent {
  schemaVersion: string;       // "fulfillpay.call-intent.v1"
  taskContextHash: HexString;  // Bytes32 — hash of TaskContext
  callIndex: number;           // zero-based index within proof bundle
  host: string;
  path: string;
  method: string;
  declaredModel: string;
  requestBodyHash: HexString;  // Bytes32
}

/**
 * DeliveryReceipt — standardized receipt produced by zkTLS adapter.
 * Fixture: test/fixtures/protocol/receipts/receipt.mock.valid.json
 */
export interface DeliveryReceipt {
  schemaVersion: string;       // "fulfillpay.delivery-receipt.v1"
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: HexString;   // Bytes32
  provider: string;
  providerProofId: string;
  requestHash: HexString;      // Bytes32
  responseHash: HexString;     // Bytes32
  observedAt: string;          // UnixMillis
  extracted: {
    model: string;
    usage: {
      totalTokens: number;
    };
  };
  rawProofHash: HexString;     // Bytes32
  rawProofURI: string;         // URI
}

/**
 * ProofBundle — seller-submitted aggregate of receipts.
 * Fixture: test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json
 */
export interface ProofBundle {
  schemaVersion: string;       // "fulfillpay.proof-bundle.v1"
  taskId: HexString;           // Bytes32
  commitmentHash: HexString;   // Bytes32
  seller: HexString;           // Address
  receipts: DeliveryReceipt[];
  aggregateUsage: {
    totalTokens: number;
  };
  createdAt: string;           // UnixMillis
}

/**
 * VerificationReport (off-chain) — full verifier-signed report object.
 * The unsigned body is hashed for `verificationReportHash`.
 * Excludes `reportHash` and `signature` from hash computation.
 * Fixture: test/fixtures/protocol/verification-reports/verification-report.pass-basic.unsigned.json
 */
export interface VerificationReport {
  schemaVersion: string;       // "fulfillpay.verification-report.v1"
  chainId: string;             // UIntString
  settlementContract: HexString; // Address
  taskId: HexString;           // Bytes32
  buyer: HexString;            // Address
  seller: HexString;            // Address
  commitmentHash: HexString;   // Bytes32
  proofBundleHash: HexString;  // Bytes32
  passed: boolean;
  checks: {
    commitmentHashMatched: boolean;
    proofBundleHashMatched: boolean;
    zkTlsProofValid: boolean;
    endpointMatched: boolean;
    taskContextMatched: boolean;
    callIndicesUnique: boolean;
    proofNotConsumed: boolean;
    withinTaskWindow: boolean;
    modelMatched: boolean;
    usageSatisfied: boolean;
  };
  aggregateUsage: {
    totalTokens: number;
  };
  settlement: {
    action: string;            // "RELEASE" | "REFUND"
    amount: string;            // UIntString
  };
  verifier: HexString;         // Address
  verifiedAt: string;          // UnixMillis
  reportHash?: HexString;      // Bytes32 — convenience, excluded from hash
  signature?: string;          // EIP-712 signature, excluded from hash
}

// ---------------------------------------------------------------------------
// EIP-712 / Contract-aligned types
// ---------------------------------------------------------------------------

/**
 * EIP-712 Domain used for signing VerificationReports.
 * Matches contract EIP712_NAME = "FulfillPay", EIP712_VERSION = "1".
 */
export interface EIP712Domain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: HexString;
}

/**
 * VerificationReport struct as used in EIP-712 signing and the contract.
 * This is the on-chain representation with numeric settlementAction and amounts.
 */
export interface VerificationReportStruct {
  taskId: HexString;           // bytes32
  buyer: HexString;            // address
  seller: HexString;           // address
  commitmentHash: HexString;   // bytes32
  proofBundleHash: HexString;  // bytes32
  passed: boolean;
  settlementAction: number;    // uint8: 1=RELEASE, 2=REFUND
  settlementAmount: bigint;    // uint256
  verifiedAt: bigint;          // uint256
  reportHash: HexString;       // bytes32
}

/**
 * Signed report: the contract-level struct plus the 65-byte EIP-712 signature.
 */
export interface SignedReport {
  report: VerificationReportStruct;
  signature: HexString;        // 65 bytes
}

// ---------------------------------------------------------------------------
// Adapter interfaces
// ---------------------------------------------------------------------------

/**
 * Storage adapter interface for persisting protocol objects.
 */
export interface StorageProvider {
  store(key: string, data: unknown): Promise<void>;
  retrieve(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
}

/**
 * zkTLS provider interface for proof generation and verification.
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
  index: number;
  length: number;
}

/** Result of zkTLS proof generation. */
export interface ZkTLSResult {
  proof: HexString;
  publicSignals: HexString[];
  receiptHash: HexString;
}
