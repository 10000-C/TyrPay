# Fixtures and Test Vectors

This document defines the fixture set required for M0 interoperability.

## Directory Layout

Recommended repository layout:

```text
test/
  fixtures/
    protocol/
      task-intents/
      commitments/
      task-contexts/
      call-intents/
      receipts/
      proof-bundles/
      verification-reports/
      vectors/
```

## Fixture File Shape

Each fixture SHOULD use:

```json
{
  "name": "pass-basic",
  "objectType": "ExecutionCommitment",
  "object": {},
  "canonical": "{}",
  "hash": "0x...",
  "notes": "..."
}
```

`canonical` and `hash` are required for every hashed object fixture.

## Required Positive Fixtures

| Fixture | Purpose |
|---|---|
| `task-intent.basic.json` | Minimal valid task intent. |
| `commitment.openai-compatible.json` | Valid OpenAI-compatible commitment. |
| `task-context.basic.json` | Valid proof binding context. |
| `call-intent.basic.json` | Valid call intent and `callIntentHash`. |
| `receipt.mock.valid.json` | Valid mock zkTLS receipt. |
| `proof-bundle.pass-basic.json` | One or more valid receipts satisfying usage. |
| `verification-report.pass-basic.json` | Valid signed pass report. |

## Required Negative Fixtures

| Fixture | Expected Failure |
|---|---|
| `commitment.model-empty.json` | Buyer SDK or verifier rejects empty `allowedModels`. |
| `receipt.context-wrong-task.json` | `taskContextMatched=false`. |
| `receipt.model-mismatch.json` | `modelMatched=false`. |
| `receipt.timestamp-before-funded.json` | `withinTaskWindow=false`. |
| `receipt.timestamp-after-deadline.json` | `withinTaskWindow=false`. |
| `proof-bundle.usage-insufficient.json` | `usageSatisfied=false`. |
| `proof-bundle.duplicate-receipt.json` | Verifier rejects or fails proof consumption. |
| `verification-report.bad-verifier.json` | Contract rejects signature. |
| `verification-report.wrong-chain.json` | Contract rejects EIP-712 domain. |
| `verification-report.wrong-contract.json` | Contract rejects EIP-712 domain. |

## Vector Requirements

At minimum, vectors MUST prove consistency for:

| Vector | Producers | Consumers |
|---|---|---|
| `commitmentHash` | Seller SDK, SDK Core | Buyer SDK, Verifier, Contract tests |
| `taskContextHash` | SDK Core | Seller SDK, zkTLS Adapter, Verifier |
| `callIntentHash` | Seller SDK | zkTLS Adapter, Verifier |
| `receiptHash` | zkTLS Adapter, Seller SDK | Verifier |
| `proofBundleHash` | Seller SDK | Contract, Verifier |
| `verificationReportHash` | Verifier | Verifier client, E2E tests |
| EIP-712 recovered signer | Verifier | Contract tests |

## M0 Acceptance Criteria

M0 is complete when:

| Criterion |
|---|
| Every protocol object has at least one positive fixture. |
| Every hash rule has at least one deterministic test vector. |
| At least one full PASS scenario links all object hashes end to end. |
| At least one FAIL scenario covers model mismatch. |
| At least one FAIL scenario covers insufficient usage. |
| At least one replay scenario covers duplicate `proofBundleHash`. |
| TypeScript SDK Core and Solidity tests consume the same vectors. |
