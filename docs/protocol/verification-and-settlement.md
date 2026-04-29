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
| Contract timing config | Settlement contract view for `proofSubmissionGracePeriod` and `verificationTimeout`. |
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
| `callIndicesUnique` | Every receipt uses a unique `callIndex` within the bundle. |
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
  callIndicesUnique &&
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

Temporary unavailability is not the same as semantic failure. Examples include:

| Availability Issue |
|---|
| RPC lag or transient chain read failure. |
| Storage gateway outage or propagation delay. |
| Rate limiting or temporary upstream unavailability. |
| Objects that were committed on-chain but are not yet retrievable from storage. |

Verifier MUST NOT sign a failing report solely because required inputs are
temporarily unavailable.

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

## Timeout Refund Paths

The settlement contract MUST also expose bounded timeout exits:

```text
refundAfterProofSubmissionDeadline:
  require(task.status == FUNDED)
  require(block.timestamp > task.deadline + proofSubmissionGracePeriod)
  refund escrow to buyer
  task.status = REFUNDED

refundAfterVerificationTimeout:
  require(task.status == PROOF_SUBMITTED)
  require(block.timestamp > task.proofSubmittedAt + verificationTimeout)
  refund escrow to buyer
  task.status = REFUNDED
```

`proofSubmissionGracePeriod` exists to allow execution that finished before
`deadline` to be uploaded, stored, and submitted slightly later.

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
