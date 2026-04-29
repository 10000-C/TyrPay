# Signatures and Replay Protection

This document defines verifier signatures and replay protection bindings.

## EIP-712 Domain

Verifier reports MUST be signed using EIP-712.

```text
name: "FulfillPay"
version: "1"
chainId: <settlement chain id>
verifyingContract: <settlement contract address>
```

The settlement contract MUST reject signatures recovered from signers that are
not authorized by the verifier registry or equivalent access control.

## Report Typed Data

Phase 1 signs the minimum fields needed for safe settlement:

```solidity
struct VerificationReport {
  bytes32 taskId;
  address buyer;
  address seller;
  bytes32 commitmentHash;
  bytes32 proofBundleHash;
  bool passed;
  uint8 settlementAction;
  uint256 settlementAmount;
  uint256 verifiedAt;
}
```

`settlementAction` values:

| Value | Meaning |
|---|---|
| `1` | `RELEASE` |
| `2` | `REFUND` |

The signed struct intentionally excludes large check details. Check details live
in the off-chain `VerificationReport` object and are bound indirectly by
`proofBundleHash`, `commitmentHash`, and verifier accountability.

## Required Settlement Checks

When consuming a signed report, the contract MUST check:

| Check |
|---|
| Task state is `PROOF_SUBMITTED`. |
| Report `taskId` matches task. |
| Report `buyer` and `seller` match task. |
| Report `commitmentHash` matches task. |
| Report `proofBundleHash` matches task. |
| Report `settlementAmount` equals full task amount. |
| `settlementAction` is `RELEASE` when `passed=true`. |
| `settlementAction` is `REFUND` when `passed=false`. |
| Recovered verifier is authorized. |
| `proofBundleHash` has not been consumed. |

## Proof-Level Task Binding

Every `DeliveryReceipt` MUST contain a `TaskContext` with:

| Field |
|---|
| `chainId` |
| `settlementContract` |
| `taskId` |
| `taskNonce` |
| `commitmentHash` |
| `buyer` |
| `seller` |

Every provider proof context MUST also bind:

| Field |
|---|
| `callIndex` |
| `callIntentHash` |

Verifier MUST reject any receipt whose proof context differs from the expected
task context or call intent.

## Replay Defenses

| Replay Attempt | Defense |
|---|---|
| Report replay across chains | EIP-712 domain `chainId`. |
| Report replay across contracts | EIP-712 `verifyingContract`. |
| Report replay across tasks | Signed `taskId`. |
| Report replay across commitments | Signed `commitmentHash`. |
| Report replay across proof bundles | Signed `proofBundleHash`. |
| Proof replay across tasks | Receipt `TaskContext`. |
| Proof replay inside verifier | Proof consumption registry. |
| Proof bundle replay on-chain | `usedProofBundleHash` and terminal task state. |

## Consumption Registry

The verifier SHOULD track at least:

| Key | Purpose |
|---|---|
| `providerProofId` | Prevent provider-level proof replay. |
| `receiptHash` | Prevent receipt replay. |
| `responseHash` | Prevent response replay when provider IDs are insufficient. |
| `callIntentHash` | Prevent duplicated call intent claims. |

The contract MUST track:

| Key | Purpose |
|---|---|
| `proofBundleHash` | Prevent proof bundle replay at settlement. |
| task terminal status | Prevent double settlement. |

## Security Boundary

Phase 1 uses proof-level task binding. It does not prove that the upstream API
request body or headers contained `taskNonce`.

Future request-level binding MAY add a nonce-derived value directly into the HTTP
transcript. That is out of scope for M0.
