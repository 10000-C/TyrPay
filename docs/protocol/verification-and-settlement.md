# Verification and Settlement

This document defines verifier checks, report semantics, and settlement rules.

## Verification Inputs

Verifier MUST load:

| Input | Source |
|---|---|
| Task state | Settlement contract. |
| Commitment hash and URI | Settlement contract and storage. |
| Proof bundle hash and URI | Settlement contract and storage. |
| Raw proof objects | Storage through receipt URIs. |
| Verifier authorization | Verifier registry or configured contract view. |

Verifier MUST verify storage objects by recomputing hashes before using them.

## Check Matrix

`VerificationReport.checks` MUST include:

| Check | Pass Condition |
|---|---|
| `commitmentHashMatched` | Stored commitment hashes to task `commitmentHash`. |
| `proofBundleHashMatched` | Stored bundle hashes to task `proofBundleHash`. |
| `zkTlsProofValid` | Every raw proof verifies under its provider adapter. |
| `endpointMatched` | Every receipt target satisfies commitment target constraints. |
| `taskContextMatched` | Every receipt context matches task and commitment. |
| `proofNotConsumed` | No proof, receipt, response, or call intent was previously consumed. |
| `withinTaskWindow` | Every receipt timestamp is `>= fundedAt` and `<= deadline`. |
| `modelMatched` | Every observed model is in `allowedModels`. |
| `usageSatisfied` | Accepted aggregate usage meets or exceeds `minUsage`. |

## Pass Rule

`passed` MUST be `true` only if every required check is `true`.

```text
passed =
  commitmentHashMatched &&
  proofBundleHashMatched &&
  zkTlsProofValid &&
  endpointMatched &&
  taskContextMatched &&
  proofNotConsumed &&
  withinTaskWindow &&
  modelMatched &&
  usageSatisfied
```

## Settlement Rule

Phase 1 uses binary settlement:

| `passed` | `settlement.action` | Final Contract State |
|---|---|---|
| `true` | `RELEASE` | `SETTLED` |
| `false` | `REFUND` | `REFUNDED` |

`settlement.amount` MUST equal the full escrowed amount. Partial settlement is
out of scope.

## Report Generation Policy

Verifier SHOULD NOT sign a report when it cannot obtain required inputs from
storage or chain.

Verifier MAY sign a failing report when all required inputs are available and
the failure is semantic or cryptographic, such as:

| Failure |
|---|
| Invalid zkTLS proof. |
| Endpoint mismatch. |
| Task context mismatch. |
| Timestamp outside task window. |
| Model mismatch. |
| Insufficient usage. |
| Previously consumed proof. |

This distinction avoids turning temporary storage unavailability into an
immediate refund decision.

## Contract Settlement Algorithm

The settlement contract MUST enforce:

```text
require(task.status == PROOF_SUBMITTED)
require(report.taskId == task.taskId)
require(report.buyer == task.buyer)
require(report.seller == task.seller)
require(report.commitmentHash == task.commitmentHash)
require(report.proofBundleHash == task.proofBundleHash)
require(!usedProofBundleHash[report.proofBundleHash])
require(recoveredVerifier is authorized)
require(report.settlementAmount == task.amount)
require(action matches passed)

usedProofBundleHash[report.proofBundleHash] = true

if report.passed:
  task.status = SETTLED
  transfer escrow to seller
else:
  task.status = REFUNDED
  transfer escrow to buyer
```

## Verifier Consumption Timing

Verifier SHOULD mark proofs as consumed only after it has produced a report for a
specific `taskId` and `proofBundleHash`.

If settlement transaction submission fails, the verifier MAY keep the proof as
reserved for the same task and bundle, but MUST NOT allow it to be reused for a
different task or bundle.

## Non-Goals

Phase 1 verifier MUST NOT decide:

| Non-goal |
|---|
| Whether the model output is useful. |
| Whether the answer is factually correct. |
| Whether Buyer is satisfied. |
| Partial payment amount. |
| Marketplace reputation impact. |
