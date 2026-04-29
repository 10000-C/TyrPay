# Boundary Cases

This document derives Phase 1 boundary cases from the canonical state machine.
Each case should become at least one contract, SDK, verifier, or E2E test.

## State Transition Cases

| Case | Current State | Attempt | Expected Result |
|---|---|---|---|
| Duplicate intent creation with same client nonce | Any | `createTaskIntent` | Allowed only if contract task identity remains unique. |
| Commitment submitted by non-seller | `INTENT_CREATED` | `submitCommitment` | Revert. |
| Empty commitment hash | `INTENT_CREATED` | `submitCommitment` | Revert. |
| Commitment after deadline | `INTENT_CREATED` | `submitCommitment` | Revert or terminal cancellation, depending on implementation entrypoint. |
| Funding before commitment | `INTENT_CREATED` | `fundTask` | Revert. |
| Funding with wrong token | `COMMITMENT_SUBMITTED` | `fundTask` | Revert. |
| Funding with wrong amount | `COMMITMENT_SUBMITTED` | `fundTask` | Revert. |
| Funding by non-buyer | `COMMITMENT_SUBMITTED` | `fundTask` | Revert unless explicitly allowed by task policy. |
| Proof before funding | `COMMITMENT_SUBMITTED` | `submitProofBundle` | Revert. |
| Proof submitted by non-seller | `FUNDED` | `submitProofBundle` | Revert. |
| Empty proof bundle hash | `FUNDED` | `submitProofBundle` | Revert. |
| Proof after deadline | `FUNDED` | `submitProofBundle` | Revert; Buyer can refund. |
| Settle before proof | `FUNDED` | `settle` | Revert. |
| Settle with unauthorized verifier | `PROOF_SUBMITTED` | `settle` | Revert. |
| Settle with malformed report | `PROOF_SUBMITTED` | `settle` | Revert. |
| Duplicate settlement | `SETTLED` or `REFUNDED` | `settle` | Revert. |

## Commitment Cases

| Case | Expected Result |
|---|---|
| `commitmentHash` does not match stored commitment object | Buyer SDK rejects before funding; verifier rejects if discovered later. |
| Commitment names unsupported API host or path | Buyer SDK SHOULD reject; verifier MUST reject proof if endpoint does not match. |
| Commitment has empty `allowedModels` | Buyer SDK SHOULD reject; verifier MUST fail `modelMatched`. |
| Commitment has zero `minUsage` | MAY be allowed for connectivity tests, but SHOULD be disallowed for paid production tasks. |
| Commitment has deadline earlier than current block time | Contract MUST reject intent or commitment. |
| Seller submits different commitment object under same hash URI | Hash check MUST fail. |

## Proof Bundle Cases

| Case | Expected Result |
|---|---|
| `proofBundleHash` does not match bundle bytes | Verifier MUST reject. |
| Bundle references unknown `taskId` | Verifier MUST reject. |
| Bundle binds wrong `taskNonce` | Verifier MUST reject. |
| Bundle binds wrong `commitmentHash` | Verifier MUST reject. |
| Bundle binds wrong `buyer`, `seller`, `chainId`, or `settlementContract` | Verifier MUST reject. |
| Duplicate receipt in same bundle | Verifier MUST reject or count it once; Phase 1 SHOULD reject. |
| Empty receipt list | Verifier MUST fail `usageSatisfied`. |
| Receipt has unsupported proof provider | Verifier MUST reject unless provider is explicitly enabled. |
| Receipt timestamp before `fundedAt` | Verifier MUST fail `withinTaskWindow`. |
| Receipt timestamp after `deadline` | Verifier MUST fail `withinTaskWindow`. |

## Replay Cases

| Case | Defense |
|---|---|
| Same `proofBundleHash` settled twice | Contract `usedProofBundleHash` and terminal task state. |
| Same receipt reused in another bundle for same task | Verifier proof consumption registry. |
| Same proof reused for another task | Proof context binds `taskId`, `taskNonce`, `commitmentHash`, `buyer`, and `seller`. |
| Same proof reused on another chain | Proof context and EIP-712 domain bind `chainId`. |
| Same proof reused on another settlement contract | Proof context and EIP-712 domain bind `settlementContract`. |
| Same report replayed against another task | EIP-712 report binds `taskId`, `commitmentHash`, and `proofBundleHash`. |

## Verification Cases

| Case | `passed` | Settlement Action |
|---|---|---|
| All checks pass | `true` | `RELEASE` |
| zkTLS proof invalid | `false` | `REFUND` |
| Endpoint mismatch | `false` | `REFUND` |
| Task context mismatch | `false` | `REFUND` |
| Proof already consumed | `false` or reject report generation | `REFUND` if report is generated |
| Timestamp outside window | `false` | `REFUND` |
| Model not allowed | `false` | `REFUND` |
| Aggregate usage below minimum | `false` | `REFUND` |
| Storage object unavailable | no signed report SHOULD be produced | No settlement until timeout/refund path. |

## Timeout Cases

| Case | Expected Result |
|---|---|
| No commitment before acceptance deadline | SDK MAY expose `EXPIRED`; no escrow movement is required. |
| Commitment submitted but Buyer never funds | SDK MAY expose `EXPIRED`; no escrow movement is required. |
| Funded but no proof before deadline | Buyer can call refund path. |
| Proof submitted but verifier unavailable | Funds remain escrowed until report settlement or explicit governance/emergency process. Phase 1 SHOULD keep this out of the core protocol. |

## E2E Minimum Tests

The first closed-loop test suite MUST cover:

| Test | Expected Final State |
|---|---|
| Valid commitment, valid proof, sufficient usage | `SETTLED` |
| Valid proof with model mismatch | `REFUNDED` |
| Valid proof with insufficient usage | `REFUNDED` |
| Replayed proof bundle | First task settles or refunds; replay reverts. |
| Unauthorized verifier signature | Revert, state remains `PROOF_SUBMITTED`. |
| Proof after deadline | Revert on proof submission or verifier fail, depending on timing policy. |
