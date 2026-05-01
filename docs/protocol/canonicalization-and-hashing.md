# Canonicalization and Hashing

This document defines deterministic object encoding and hash rules.

## Goals

Canonicalization MUST make the same protocol object hash identically across:

| Consumer |
|---|
| Solidity tests |
| TypeScript SDK Core |
| Buyer SDK |
| Seller SDK |
| Verifier |
| Storage adapters |
| E2E fixtures |

## Canonical JSON

M0 uses canonical JSON as the cross-module object representation.

Rules:

| Rule | Requirement |
|---|---|
| Object key order | Sort keys lexicographically by Unicode code point. |
| Arrays | Preserve array order. |
| Undefined | MUST NOT appear. |
| Null | MUST NOT be used unless a field explicitly allows it. M0 objects SHOULD omit absent optional fields. |
| Booleans | JSON `true` or `false`. |
| Integers | Use JSON numbers only when values are safely bounded by JavaScript integer range and Solidity tests do not consume them directly. Use decimal strings for chain amounts, chain IDs, and timestamps. |
| Strings | Use UTF-8 strings without surrounding whitespace normalization. |
| Addresses | Lowercase `0x`-prefixed 20-byte hex. |
| Bytes32 | Lowercase `0x`-prefixed 32-byte hex. |
| Extra fields | MUST be rejected for signed and hashed protocol objects. |

Canonical JSON MUST be serialized without insignificant whitespace.

## Hash Function

All object hashes use:

```text
keccak256(utf8(canonical_json(object)))
```

This keeps SDK, verifier, and Solidity test vectors aligned with EVM-native
hashing.

## Object Hashes

| Hash | Input |
|---|---|
| `taskIntentHash` | Canonical `TaskIntent`. |
| `taskContextHash` | Canonical `TaskContext`. |
| `commitmentHash` | Canonical `ExecutionCommitment`. |
| `callIntentHash` | Canonical `CallIntent`. |
| `receiptHash` | Canonical `DeliveryReceipt` excluding no fields. |
| `proofBundleHash` | Canonical `ProofBundle`. |
| `verificationReportHash` | Canonical unsigned `VerificationReport`, excluding `reportHash` and `signature`. |
| `rawProofHash` | Canonical provider raw proof wrapper or binary hash rule defined by adapter. |
| `requestBodyHash` | Canonical redacted request body. |
| `responseHash` | Canonical redacted response body. |

## Signed Report Hash Input

`VerificationReport.signature` MUST NOT be included in the report hash.

`VerificationReport.reportHash` is a convenience field and MUST NOT be included
when computing `verificationReportHash`.

## Solidity Struct Hashes

EIP-712 signing does not sign canonical JSON directly. It signs typed report
fields defined in [signatures-and-replay-protection.md](./signatures-and-replay-protection.md).

The canonical JSON report hash and EIP-712 struct hash MUST bind the same
semantic values:

| Canonical JSON Field | EIP-712 Field |
|---|---|
| `taskId` | `taskId` |
| `buyer` | `buyer` |
| `seller` | `seller` |
| `commitmentHash` | `commitmentHash` |
| `proofBundleHash` | `proofBundleHash` |
| `passed` | `passed` |
| `settlement.action` | `settlementAction` |
| `settlement.amount` | `settlementAmount` |
| `verifiedAt` | `verifiedAt` || `reportHash` | `reportHash` |
## Redaction Rule

If a request or response contains private content, the stored object MAY be a
redacted normalized object. The hash MUST be computed over exactly what is stored
and what the verifier can inspect.

Phase 1 MUST NOT rely on hidden fields for verification decisions.

## Test Vector Requirements

Every fixture object MUST include:

| Field | Requirement |
|---|---|
| `canonical` | The canonical JSON string. |
| `hash` | The expected `keccak256` hash. |
| `source` | The fixture filename or scenario name. |
