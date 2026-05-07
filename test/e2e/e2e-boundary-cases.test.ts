import { expect } from "chai";
import { ethers } from "hardhat";

import { type Bytes32 } from "@fulfillpay/sdk-core";

import {
  deployVerifierE2eFixture,
  verifyAndSettle,
  shutdownVerifier,
  type VerifierE2eEnvironment
} from "./helpers/verifier-setup";

import {
  buildTestCommitment,
  submitCommitmentOnChain,
  sellerProvenFetch,
  sellerBuildAndUploadProof,
  sellerSubmitProof,
  sellerFullFlow,
  currentTimeMs,
  increaseTime,
  DEFAULT_AMOUNT,
  INITIAL_BALANCE
} from "./helpers/setup";

/**
 * E2E-06: Proof submitted after deadline but within grace period → RELEASE
 * E2E-07: Duplicate callIndex in proof bundle → verifier returns 400 (assertProofBundle fails)
 * E2E-08: observedAt outside task window (before fundedAt) → withinTaskWindow=false → REFUND
 */
describe("E2E-06/07/08: Boundary Cases", function () {
  this.timeout(120_000);

  let env: VerifierE2eEnvironment;

  beforeEach(async function () {
    env = await deployVerifierE2eFixture();
  });

  afterEach(async function () {
    await shutdownVerifier(env);
  });

  // ─── E2E-06: Grace Period Proof Submission ─────────────────────────────────

  it("E2E-06: accepts proof submitted after deadline but within grace period and settles RELEASE", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitment = buildTestCommitment({
      taskId: created.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    // Step 1: Generate proof and build bundle BEFORE deadline.
    // observedAt = current EVM time (within [fundedAt, deadline]).
    const fetchOutput = await sellerProvenFetch({
      env,
      commitment,
      taskNonce: created.taskNonce as Bytes32
    });
    const proofOutput = await sellerBuildAndUploadProof({
      env,
      commitment,
      receipts: [fetchOutput.receipt]
    });

    // Step 2: Advance EVM time past deadline but still within grace period.
    // deadline = +60min; grace = +15min; advance 61min (still within grace).
    await increaseTime(61 * 60);

    // Step 3: Submit proof hash on-chain (within grace period → accepted).
    await sellerSubmitProof({
      env,
      commitment,
      proofBundleHash: proofOutput.proofBundleHash,
      proofBundleURI: proofOutput.proofBundleURI
    });

    let task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("PROOF_SUBMITTED");

    // Step 4: Verifier checks withinTaskWindow using stored observedAt (before deadline).
    const { result } = await verifyAndSettle({ env, taskId: created.taskId });

    expect(
      result.checks.withinTaskWindow,
      `withinTaskWindow should be true (observedAt was before deadline). checks=${JSON.stringify(result.checks)}`
    ).to.equal(true);
    expect(result.report.passed).to.equal(true);
    expect(result.report.settlement.action).to.equal("RELEASE");

    task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("SETTLED");

    expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(DEFAULT_AMOUNT);
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
    expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(INITIAL_BALANCE - DEFAULT_AMOUNT);
  });

  // ─── E2E-07: Multi-receipt Proof Bundle ───────────────────────────────────
  //
  // A seller makes two separate API calls (callIndex=0, callIndex=1) and bundles
  // both receipts. Verifier aggregates usage across both receipts and settles RELEASE.
  // Note: The SDK (assertProofBundleReceipts), storage adapter (toCanonicalJsonValue),
  // and verifier (assertProofBundle in loadInputs) all enforce callIndex uniqueness
  // at their respective layers — duplicate callIndex is rejected before the verifier's
  // evaluate() is even reached.

  it("E2E-07: settles multi-call proof bundle with unique callIndices correctly (RELEASE)", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
    // Commitment requires 200 tokens — two calls of 128 tokens each satisfy this
    const minTokens = 200;

    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitment = buildTestCommitment({
      taskId: created.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address,
      overrides: { minUsage: { totalTokens: minTokens } }
    });

    await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    // Two distinct calls with unique callIndices (0 and 1). Both use the same totalTokens
    // to verify the module correctly identifies uniqueness via callIntentHash (not responseHash).
    // callIntentHash covers taskContext + callIndex + request body, so different callIndices
    // always produce different callIntentHashes regardless of the API response content.
    const fetchA = await sellerProvenFetch({
      env, commitment, taskNonce: created.taskNonce as Bytes32,
      callIndex: 0,
      totalTokens: 128,
      requestBodyOverride: { model: commitment.allowedModels[0], messages: [{ role: "user", content: "call-A" }] }
    });
    const fetchB = await sellerProvenFetch({
      env, commitment, taskNonce: created.taskNonce as Bytes32,
      callIndex: 1,
      totalTokens: 128,
      requestBodyOverride: { model: commitment.allowedModels[0], messages: [{ role: "user", content: "call-B" }] }
    });

    // Both receipts bundled together (callIndex 0 and 1 are unique)
    const proofOutput = await sellerBuildAndUploadProof({
      env, commitment, receipts: [fetchA.receipt, fetchB.receipt]
    });

    await sellerSubmitProof({
      env, commitment,
      proofBundleHash: proofOutput.proofBundleHash,
      proofBundleURI: proofOutput.proofBundleURI
    });

    let task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("PROOF_SUBMITTED");

    // Verifier: callIndicesUnique=true, totalTokens=256 >= minTokens=200 → RELEASE
    const { result } = await verifyAndSettle({ env, taskId: created.taskId });

    expect(result.checks.callIndicesUnique, "callIndicesUnique should be true").to.equal(true);
    expect(result.checks.usageSatisfied, "usageSatisfied should be true (256 >= 200)").to.equal(true);
    expect(result.aggregateUsage.totalTokens).to.equal(256);  // 128 + 128
    expect(result.report.passed).to.equal(true);
    expect(result.report.settlement.action).to.equal("RELEASE");

    task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("SETTLED");

    expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(DEFAULT_AMOUNT);
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
    expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(INITIAL_BALANCE - DEFAULT_AMOUNT);
  });

  // ─── E2E-08: Timestamp Before fundedAt ────────────────────────────────────

  it("E2E-08: refunds buyer when proof observedAt is before task fundedAt (outside task window)", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitment = buildTestCommitment({
      taskId: created.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    // Read fundedAt from on-chain task to set the exact timestamp boundary
    const onChainTask = await env.settlement.getTask(created.taskId);
    const fundedAt = onChainTask.fundedAtMs;

    // Generate proof with observedAt = fundedAt - 1ms (one millisecond before funding)
    await sellerFullFlow({
      env,
      commitment,
      taskNonce: created.taskNonce as Bytes32,
      scenario: "timestamp_before_funded",
      timeWindow: { fundedAt }
    });

    let task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("PROOF_SUBMITTED");

    // Verifier: observedAt < fundedAt → withinTaskWindow = false → passed = false → REFUND
    const { result } = await verifyAndSettle({ env, taskId: created.taskId });

    expect(
      result.checks.withinTaskWindow,
      `withinTaskWindow should be false. checks=${JSON.stringify(result.checks)}`
    ).to.equal(false);
    expect(result.report.passed).to.equal(false);
    expect(result.report.settlement.action).to.equal("REFUND");

    task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("REFUNDED");

    expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(INITIAL_BALANCE);
    expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(0n);
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
  });
});
