/**
 * EIP-712 typed-data signing and recovery for FulFilPay VerificationReports.
 *
 * Domain:
 *   name:    "FulfillPay"
 *   version: "1"
 *   chainId: <settlement chain id>
 *   verifyingContract: <settlement contract address>
 *
 * The contract's `_hashVerificationReport` produces the structHash.
 * The contract's `_hashTypedDataV4` wraps it with the domain separator.
 *
 * Test vectors: test/vectors/eip712/verification-report-pass-basic.json
 *   domainSeparator: 0x24b3aa9c4fe0856f88593c669f4845c91c217001e4dd664a60975b6d9342f55b
 *   structHash:      0xd319f365b0afdf45f929b60581a6dc69ab72e5be9d79bc1e0e32e565f038d34f
 *   digest:          0x689219a247fb2fda3c61a7f570712a2ec00ae94ea5cf24b8bfaa09e6d8ca3bdb
 */

import {
  TypedDataEncoder,
  SigningKey,
  computeAddress,
} from "ethers";

import type {
  HexString,
  EIP712Domain,
  VerificationReportStruct,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// EIP-712 type definitions (matching the contract)
// ---------------------------------------------------------------------------

/**
 * Field definition for EIP-712 types.
 */
interface TypedDataField {
  name: string;
  type: string;
}

/**
 * The EIP-712 type definition for VerificationReport, matching the contract struct.
 *
 * Contract typehash:
 *   keccak256("VerificationReport(bytes32 taskId,address buyer,address seller,bytes32 commitmentHash,bytes32 proofBundleHash,bool passed,uint8 settlementAction,uint256 settlementAmount,uint256 verifiedAt,bytes32 reportHash)")
 */
export const VERIFICATION_REPORT_TYPES: Record<string, TypedDataField[]> = {
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
// Domain helpers
// ---------------------------------------------------------------------------

/**
 * Build an EIP-712 domain from settlement parameters.
 *
 * Matches contract constants:
 *   EIP712_NAME = "FulfillPay"
 *   EIP712_VERSION = "1"
 *
 * @param chainId - The settlement chain ID
 * @param verifyingContract - The settlement contract address
 * @returns The EIP-712 domain object
 */
export function buildDomain(
  chainId: bigint,
  verifyingContract: HexString,
): EIP712Domain {
  return {
    name: "FulfillPay",
    version: "1",
    chainId,
    verifyingContract,
  };
}

// ---------------------------------------------------------------------------
// Type hash helpers
// ---------------------------------------------------------------------------

/**
 * Return the VerificationReport EIP-712 type definition.
 * Used for `signTypedData` calls in ethers.
 */
export function buildVerificationReportType(): Record<string, TypedDataField[]> {
  return VERIFICATION_REPORT_TYPES;
}

// ---------------------------------------------------------------------------
// Internal helper to build the EIP-712 message object
// ---------------------------------------------------------------------------

function toMessage(report: VerificationReportStruct): Record<string, unknown> {
  return {
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
  };
}

function domainToRecord(domain: EIP712Domain): Record<string, unknown> {
  return {
    name: domain.name,
    version: domain.version,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract,
  };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Compute the EIP-712 domain separator.
 *
 * Test vector (chainId=31337, contract=0x4444...4444):
 *   0x24b3aa9c4fe0856f88593c669f4845c91c217001e4dd664a60975b6d9342f55b
 */
export function hashDomainSeparator(domain: EIP712Domain): HexString {
  return TypedDataEncoder.hashDomain(domainToRecord(domain)) as HexString;
}

/**
 * Compute the EIP-712 typed data hash (digest) for a VerificationReport.
 *
 * This is: keccak256("\x19\x01" || domainSeparator || structHash)
 * Which matches the contract's `_hashTypedDataV4(_hashVerificationReport(report))`.
 *
 * Test vector digest:
 *   0x689219a247fb2fda3c61a7f570712a2ec00ae94ea5cf24b8bfaa09e6d8ca3bdb
 */
export function hashTypedData(
  domain: EIP712Domain,
  report: VerificationReportStruct,
): HexString {
  return TypedDataEncoder.hash(
    domainToRecord(domain),
    VERIFICATION_REPORT_TYPES,
    toMessage(report),
  ) as HexString;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Signer-like interface: any object with signTypedData method compatible with ethers v6.
 */
export interface EIP712Signer {
  signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>,
  ): Promise<string>;
}

/**
 * Sign a VerificationReport using an ethers-compatible signer.
 *
 * Produces a 65-byte secp256k1 signature (r + s + v) via EIP-712 typed data.
 *
 * @param signer - An ethers Signer (e.g., Wallet) that will sign
 * @param domain - The EIP-712 domain
 * @param report - The VerificationReport struct to sign
 * @returns The 65-byte signature as a hex string
 */
export async function signReport(
  signer: EIP712Signer,
  domain: EIP712Domain,
  report: VerificationReportStruct,
): Promise<HexString> {
  const signature = await signer.signTypedData(
    domainToRecord(domain),
    VERIFICATION_REPORT_TYPES,
    toMessage(report),
  );
  return signature as HexString;
}

// ---------------------------------------------------------------------------
// Recovery & Verification
// ---------------------------------------------------------------------------

/**
 * Recover the signer address from a typed data digest and signature.
 *
 * Uses ethers v6's SigningKey to recover the public key from the ECDSA signature,
 * then derives the address from the public key.
 *
 * @param digest - The EIP-712 typed data hash (32 bytes)
 * @param signature - The 65-byte signature
 * @returns The recovered signer address as a hex string
 */
export function recoverReporter(
  digest: HexString,
  signature: HexString,
): HexString {
  // Recover the public key from the signature
  const publicKey = SigningKey.recoverPublicKey(digest, signature);
  // Derive the address from the public key
  return computeAddress(publicKey) as HexString;
}

/**
 * Verify a report signature against an expected signer.
 *
 * @param domain - The EIP-712 domain
 * @param report - The VerificationReport struct
 * @param signature - The 65-byte signature to verify
 * @param expectedSigner - The address expected to have signed
 * @returns true if the signature is valid and was produced by expectedSigner
 */
export function verifyReportSignature(
  domain: EIP712Domain,
  report: VerificationReportStruct,
  signature: HexString,
  expectedSigner: HexString,
): boolean {
  const digest = hashTypedData(domain, report);
  const recovered = recoverReporter(digest, signature);
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}
