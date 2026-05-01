/**
 * Hashing utilities for FulFilPay protocol objects.
 *
 * Canonical JSON hashes use: keccak256(utf8(canonical_json(object)))
 * As defined in docs/protocol/canonicalization-and-hashing.md
 *
 * EIP-712 struct hashes use ethers TypedDataEncoder (matching contract behavior).
 *
 * Test vector: test/vectors/hashing/pass-basic.json
 */

import { keccak256, toUtf8Bytes, TypedDataEncoder } from "ethers";

import { canonicalize } from "../canonicalize/index.js";
import type {
  HexString,
  TaskIntent,
  TaskContext,
  ExecutionCommitment,
  CallIntent,
  DeliveryReceipt,
  ProofBundle,
  VerificationReport,
  VerificationReportStruct,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// EIP-712 type definitions (shared with eip712 module)
// ---------------------------------------------------------------------------

/** Field definition for EIP-712 types. */
interface TypedDataField {
  name: string;
  type: string;
}

/**
 * The VerificationReport EIP-712 type definition, matching the contract struct.
 * Must be kept in sync with the contract's VerificationReport fields.
 */
const VERIFICATION_REPORT_EIP712_TYPES: Record<string, TypedDataField[]> = {
  VerificationReport: [
    { name: "taskId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "commitmentHash", type: "bytes32" },
    { name: "proofBundleHash", type: "bytes32" },
    { name: "passed", type: "bool" },
    { name: "settlementAction", type: "uint8" },
    { name: "settlementAmount", type: "uint256" },
    { name: "verifiedAt", type: "uint256" },
    { name: "reportHash", type: "bytes32" },
  ],
};

// ---------------------------------------------------------------------------
// Core hash primitive
// ---------------------------------------------------------------------------

/**
 * Hash a canonical JSON string using keccak256.
 * This is the fundamental hash operation: keccak256(utf8(canonical_json)).
 *
 * @param canonicalJson - The canonical JSON string to hash
 * @returns keccak256 hash as a hex string
 */
export function hashCanonicalJson(canonicalJson: string): HexString {
  return keccak256(toUtf8Bytes(canonicalJson)) as HexString;
}

/**
 * Canonicalize and hash any protocol object.
 *
 * Equivalent to: keccak256(utf8(canonicalize(obj)))
 *
 * @param obj - Any JSON-serializable protocol object
 * @returns keccak256 hash as a hex string
 */
export function hashObject(obj: unknown): HexString {
  const canonical = canonicalize(obj);
  return hashCanonicalJson(canonical);
}

// ---------------------------------------------------------------------------
// Protocol object hash functions
// ---------------------------------------------------------------------------

/**
 * Hash a TaskIntent object.
 *
 * Test vector:
 *   task-intent.basic.json → 0x3cabd998e069ab6b94aadf54065f52f4822d1f0b74b53b18003ec0bdc03a6990
 */
export function hashTaskIntent(intent: TaskIntent): HexString {
  return hashObject(intent);
}

/**
 * Hash a TaskContext object.
 *
 * Test vector:
 *   task-context.basic.json → 0x1385f097d4a29a5e8268c6da90fc09848c035b8199f1b32d41c3a38f2d374207
 */
export function hashTaskContext(context: TaskContext): HexString {
  return hashObject(context);
}

/**
 * Hash an ExecutionCommitment object.
 *
 * The resulting hash is the `commitmentHash` stored on-chain.
 *
 * Test vector:
 *   commitment.openai-compatible.json → 0x6ca31a2e5bc526c2172ca32f128213d9b1e3bd699b0eee446e7d3172357f528a
 */
export function hashExecutionCommitment(commitment: ExecutionCommitment): HexString {
  return hashObject(commitment);
}

/**
 * Hash a CallIntent object.
 *
 * Test vector:
 *   call-intent.basic.json → 0xddd7776ef8be07ac441076aefa5eb46859a31129311dbad6b8b72f864775d76b
 */
export function hashCallIntent(callIntent: CallIntent): HexString {
  return hashObject(callIntent);
}

/**
 * Hash a DeliveryReceipt object.
 * No fields are excluded from the hash.
 *
 * Test vector:
 *   receipt.mock.valid.json → 0xf819ac0b3dd7fb8e6a0921bbd3aa213c2a9861c1c3ecbcd8d6bbf5254e8774e3
 */
export function hashDeliveryReceipt(receipt: DeliveryReceipt): HexString {
  return hashObject(receipt);
}

/**
 * Hash a ProofBundle object.
 *
 * Test vector:
 *   proof-bundle.pass-basic.json → 0xcb24838e336e57d8398dc543b2fa406471f724b26321ab4f3cce4814891de3d7
 */
export function hashProofBundle(bundle: ProofBundle): HexString {
  return hashObject(bundle);
}

/**
 * Hash a VerificationReport (unsigned, off-chain object).
 *
 * Per docs/protocol/canonicalization-and-hashing.md:
 *   - `reportHash` is excluded from hash computation
 *   - `signature` is excluded from hash computation
 *
 * Test vector:
 *   verification-report.pass-basic.unsigned.json → 0xc651276636791738328a0ce58cc3f52ef786f1ef1814144ea8a6857e31f0e715
 *
 * @param report - The full VerificationReport object
 * @returns keccak256 hash of the canonicalized report (excluding reportHash and signature)
 */
export function hashVerificationReport(report: VerificationReport): HexString {
  // Create a copy excluding reportHash and signature
  const { reportHash: _rh, signature: _sig, ...unsigned } = report;
  void _rh;
  void _sig;
  return hashObject(unsigned);
}

// ---------------------------------------------------------------------------
// EIP-712 struct hash (contract-aligned)
// ---------------------------------------------------------------------------

/**
 * The VERIFICATION_REPORT_TYPEHASH as computed by ethers TypedDataEncoder.
 *
 * This is: keccak256(encodeType("VerificationReport", types))
 * where encodeType produces:
 *   "VerificationReport(bytes32 taskId,address buyer,address seller,bytes32 commitmentHash,bytes32 proofBundleHash,bool passed,uint8 settlementAction,uint256 settlementAmount,uint256 verifiedAt,bytes32 reportHash)"
 */
export const VERIFICATION_REPORT_TYPEHASH: HexString =
  keccak256(
    toUtf8Bytes(
      "VerificationReport(bytes32 taskId,address buyer,address seller,bytes32 commitmentHash,bytes32 proofBundleHash,bool passed,uint8 settlementAction,uint256 settlementAmount,uint256 verifiedAt,bytes32 reportHash)"
    )
  ) as HexString;

/**
 * Compute the EIP-712 struct hash for a VerificationReport.
 *
 * Uses ethers TypedDataEncoder.hashStruct which implements the same algorithm
 * as the contract's `_hashVerificationReport`:
 *   keccak256(abi.encode(typeHash, field1, field2, ...))
 *
 * Test vector structHash (from eip712/verification-report-pass-basic.json):
 *   0xd319f365b0afdf45f929b60581a6dc69ab72e5be9d79bc1e0e32e565f038d34f
 */
export function hashVerificationReportStruct(report: VerificationReportStruct): HexString {
  return TypedDataEncoder.hashStruct(
    "VerificationReport",
    VERIFICATION_REPORT_EIP712_TYPES,
    {
      taskId: report.taskId,
      buyer: report.buyer,
      seller: report.seller,
      commitmentHash: report.commitmentHash,
      proofBundleHash: report.proofBundleHash,
      passed: report.passed,
      settlementAction: report.settlementAction,
      settlementAmount: report.settlementAmount,
      verifiedAt: report.verifiedAt,
      reportHash: report.reportHash,
    },
  ) as HexString;
}
