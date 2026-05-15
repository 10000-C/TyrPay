# Protocol Objects

This document defines the Phase 1 protocol objects that M0 must freeze.
Objects are versioned with `schemaVersion`.

## Schema Version Rules

Every protocol object MUST carry a `schemaVersion` field.

Version string format:

```text
TyrPay.<object-name>.v<major>
```

Phase 1 freezes the following major versions:

| Object | `schemaVersion` |
|---|---|
| `TaskIntent` | `TyrPay.task-intent.v1` |
| `TaskContext` | `TyrPay.task-context.v1` |
| `ExecutionCommitment` | `TyrPay.execution-commitment.v1` |
| `CallIntent` | `TyrPay.call-intent.v1` |
| `DeliveryReceipt` | `TyrPay.delivery-receipt.v1` |
| `ProofBundle` | `TyrPay.proof-bundle.v1` |
| `VerificationReport` | `TyrPay.verification-report.v1` |

Versioning rules:

| Rule | Requirement |
|---|---|
| Additive optional fields | MAY remain in the same major version if hash and verification semantics do not change. |
| New required fields | MUST bump the major version. |
| Changed field meaning | MUST bump the major version. |
| Changed canonicalization or hash rule | MUST bump the major version of every affected object. |
| Mixed versions inside one bundle | MUST NOT be allowed in Phase 1. All nested objects in one `ProofBundle` MUST use the same major protocol generation. |

## Phase 1 Schema Version Examples

```json
{
  "schemaVersion": "TyrPay.execution-commitment.v1"
}
```

```json
{
  "schemaVersion": "TyrPay.delivery-receipt.v1"
}
```

```json
{
  "schemaVersion": "TyrPay.proof-bundle.v1"
}
```

## Common Types

| Type | Format |
|---|---|
| `Address` | Lowercase `0x`-prefixed 20-byte hex string. |
| `Bytes32` | Lowercase `0x`-prefixed 32-byte hex string. |
| `UIntString` | Base-10 unsigned integer string, no leading zeros except `"0"`. |
| `UnixMillis` | Base-10 millisecond timestamp string. |
| `URI` | Non-empty string. |

## TaskIntent

Created by Buyer and materialized by the settlement contract.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | string | Yes | `"TyrPay.task-intent.v1"` |
| `buyer` | `Address` | Yes | Buyer wallet. |
| `seller` | `Address` | Yes | Expected Seller wallet. |
| `token` | `Address` | Yes | ERC-20 token. Native token support is out of scope for M0. |
| `amount` | `UIntString` | Yes | Escrow amount in token base units. |
| `deadline` | `UnixMillis` | Yes | Last valid execution timestamp for `DeliveryReceipt.observedAt`. It is not the proof bundle submission deadline. |
| `metadataHash` | `Bytes32` | No | Hash of optional task metadata. |
| `metadataURI` | `URI` | No | URI of optional task metadata. |

## TaskContext

Bound into every proof context and every call intent.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | string | Yes | `"TyrPay.task-context.v1"` |
| `protocol` | string | Yes | MUST be `"TyrPay"`. |
| `version` | number | Yes | MUST be `1`. |
| `chainId` | `UIntString` | Yes | Settlement chain ID. |
| `settlementContract` | `Address` | Yes | Contract verifying reports. |
| `taskId` | `Bytes32` | Yes | Contract-generated ID. |
| `taskNonce` | `Bytes32` | Yes | Contract-generated nonce. |
| `commitmentHash` | `Bytes32` | Yes | Hash of `ExecutionCommitment`. |
| `buyer` | `Address` | Yes | Buyer wallet. |
| `seller` | `Address` | Yes | Seller wallet. |

## ExecutionCommitment

Seller's promise about what will be called and what must be proven.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | string | Yes | `"TyrPay.execution-commitment.v1"` |
| `taskId` | `Bytes32` | Yes | Bound task. |
| `buyer` | `Address` | Yes | Must match task. |
| `seller` | `Address` | Yes | Must match task. |
| `target` | object | Yes | API endpoint constraints. |
| `target.host` | string | Yes | Example: `"api.openai.com"`. |
| `target.path` | string | Yes | Example: `"/v1/chat/completions"`. |
| `target.method` | string | Yes | Uppercase HTTP method. Phase 1 SHOULD use `"POST"`. |
| `allowedModels` | string[] | Yes | Non-empty list of model IDs. |
| `minUsage` | object | Yes | Minimum usage requirement. |
| `minUsage.totalTokens` | number | Yes | Aggregate minimum. |
| `deadline` | `UnixMillis` | Yes | Must match or be stricter than task deadline. |
| `verifier` | `Address` | Yes | Expected verifier signer or registry-authorized verifier. |
| `termsHash` | `Bytes32` | No | Optional hash of human-readable or machine-readable terms. |
| `termsURI` | `URI` | No | Optional URI for off-chain terms. |

## CallIntent

The normalized description of one model or API call. Its hash is included in
proof context and receipts.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | string | Yes | `"TyrPay.call-intent.v1"` |
| `taskContextHash` | `Bytes32` | Yes | Hash of `TaskContext`. |
| `callIndex` | number | Yes | Zero-based index within a proof bundle. |
| `host` | string | Yes | Must satisfy commitment target. |
| `path` | string | Yes | Must satisfy commitment target. |
| `method` | string | Yes | Must satisfy commitment target. |
| `declaredModel` | string | Yes | Model requested by Seller SDK. |
| `requestBodyHash` | `Bytes32` | Yes | Hash of canonical request body or redacted request body. |

## DeliveryReceipt

Standardized receipt produced by zkTLS adapter.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | string | Yes | `"TyrPay.delivery-receipt.v1"` |
| `taskContext` | `TaskContext` | Yes | Must match task and commitment. |
| `callIndex` | number | Yes | Must be unique within bundle. Duplicate `callIndex` values MUST be rejected in Phase 1. |
| `callIntentHash` | `Bytes32` | Yes | Hash of `CallIntent`. |
| `provider` | string | Yes | Example: `"mock"` or `"reclaim"`. |
| `providerProofId` | string | Yes | Provider-level proof or claim identifier. |
| `requestHash` | `Bytes32` | Yes | Hash of normalized request evidence. |
| `responseHash` | `Bytes32` | Yes | Hash of normalized response evidence. |
| `observedAt` | `UnixMillis` | Yes | Timestamp proven by provider or extracted from response. |
| `extracted` | object | Yes | Fields used by verifier. |
| `extracted.model` | string | Yes | Observed response model. |
| `extracted.usage` | object | Yes | Usage fields. |
| `extracted.usage.totalTokens` | number | Yes | Token total used for Phase 1. |
| `rawProofHash` | `Bytes32` | Yes | Hash of stored raw proof object. |
| `rawProofURI` | `URI` | Yes | URI of stored raw proof object. |

## ProofBundle

Seller-submitted aggregate of receipts.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | string | Yes | `"TyrPay.proof-bundle.v1"` |
| `taskId` | `Bytes32` | Yes | Bound task. |
| `commitmentHash` | `Bytes32` | Yes | Bound commitment. |
| `seller` | `Address` | Yes | Must match task. |
| `receipts` | `DeliveryReceipt[]` | Yes | Non-empty list. |
| `aggregateUsage` | object | Yes | Aggregated usage claimed by Seller SDK. |
| `aggregateUsage.totalTokens` | number | Yes | Sum of receipt usage. |
| `createdAt` | `UnixMillis` | Yes | Bundle creation time. This MAY be later than `TaskIntent.deadline` if execution completed before `deadline` and the bundle is submitted within the contract-defined proof submission grace period. |

## VerificationReport

Verifier-signed decision consumed by the settlement contract.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | string | Yes | `"TyrPay.verification-report.v1"` |
| `chainId` | `UIntString` | Yes | EIP-712 domain binding. |
| `settlementContract` | `Address` | Yes | EIP-712 domain binding. |
| `taskId` | `Bytes32` | Yes | Bound task. |
| `buyer` | `Address` | Yes | Bound buyer. |
| `seller` | `Address` | Yes | Bound seller. |
| `commitmentHash` | `Bytes32` | Yes | Bound commitment. |
| `proofBundleHash` | `Bytes32` | Yes | Bound proof bundle. |
| `passed` | boolean | Yes | Verifier result. |
| `checks` | object | Yes | Boolean check map. |
| `aggregateUsage` | object | Yes | Usage accepted by verifier. |
| `settlement` | object | Yes | Settlement decision. |
| `settlement.action` | string | Yes | `RELEASE` or `REFUND`. |
| `settlement.amount` | `UIntString` | Yes | Full task amount in Phase 1. |
| `verifier` | `Address` | Yes | Signer address. |
| `verifiedAt` | `UnixMillis` | Yes | Report generation time. |
| `reportHash` | `Bytes32` | No | Hash of unsigned report object. |
| `signature` | string | Yes | EIP-712 signature. |

## TaskStatus

Canonical persistent task status values:

```text
INTENT_CREATED
COMMITMENT_SUBMITTED
FUNDED
PROOF_SUBMITTED
SETTLED
REFUNDED
```

SDKs MAY expose `EXECUTING`, `VERIFIED_PASS`, and `VERIFIED_FAIL` as derived
statuses. SDKs MAY also expose `EXPIRED` for unfunded tasks whose `deadline`
has passed. Derived values MUST NOT be required for contract safety.

Phase 1 SDK 仅实现 `EXECUTING` 和 `EXPIRED`；`VERIFIED_PASS` / `VERIFIED_FAIL`
暂不实现，Buyer Agent 可通过 `getReport()` 主动查询 report 结果。

## SettlementAction

```text
RELEASE
REFUND
```

No partial settlement action exists in Phase 1.
