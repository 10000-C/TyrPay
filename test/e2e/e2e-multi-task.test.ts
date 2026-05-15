import { expect } from "chai";
import { ethers } from "hardhat";

import { type Bytes32 } from "@tyrpay/sdk-core";

import {
  deployVerifierE2eFixture,
  verifyAndSettle,
  shutdownVerifier,
  type VerifierE2eEnvironment
} from "./helpers/verifier-setup";

import {
  buildTestCommitment,
  submitCommitmentOnChain,
  sellerFullFlow,
  currentTimeMs,
  DEFAULT_AMOUNT,
  INITIAL_BALANCE
} from "./helpers/setup";

/**
 * E2E-15: Concurrent Tasks — Independence Guarantee
 *
 * Two tasks share the same buyer/seller/verifier but are fully independent:
 *   Task A: happy path → SETTLED (seller receives payment)
 *   Task B: model mismatch → REFUNDED (buyer recovers funds)
 *
 * Verifies that settling one task does not affect the other and that the
 * proof consumption registry does not cross-contaminate between tasks.
 */
describe("E2E-15: Concurrent Tasks — Independence Guarantee", function () {
  this.timeout(180_000);

  let env: VerifierE2eEnvironment;

  beforeEach(async function () {
    env = await deployVerifierE2eFixture();
  });

  afterEach(async function () {
    await shutdownVerifier(env);
  });

  it("settles Task A as SETTLED and Task B as REFUNDED independently", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
    const tokenAddress = await ethers.resolveAddress(env.mockToken);

    // ── Task A: happy path ──────────────────────────────────────────────────

    const createdA = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: tokenAddress,
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitmentA = buildTestCommitment({
      taskId: createdA.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    await submitCommitmentOnChain({ env, taskId: createdA.taskId as Bytes32, commitment: commitmentA });
    await env.buyerSdk.fundTask(createdA.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    await sellerFullFlow({
      env,
      commitment: commitmentA,
      taskNonce: createdA.taskNonce as Bytes32
      // scenario: "pass" is the default
    });

    // ── Task B: model mismatch ───────────────────────────────────────────────

    // Buyer needs extra balance for Task B (Task A locked DEFAULT_AMOUNT from INITIAL_BALANCE).
    // The initial approval of INITIAL_BALANCE still covers Task B's DEFAULT_AMOUNT,
    // so only the balance needs topping up.
    await (await env.mockToken.mint(env.buyer.address, DEFAULT_AMOUNT)).wait();

    const createdB = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: tokenAddress,
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitmentB = buildTestCommitment({
      taskId: createdB.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    await submitCommitmentOnChain({ env, taskId: createdB.taskId as Bytes32, commitment: commitmentB });
    await env.buyerSdk.fundTask(createdB.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    await sellerFullFlow({
      env,
      commitment: commitmentB,
      taskNonce: createdB.taskNonce as Bytes32,
      scenario: "model_mismatch"
    });

    // Both tasks are now PROOF_SUBMITTED
    expect((await env.buyerSdk.getTask(createdA.taskId)).status).to.equal("PROOF_SUBMITTED");
    expect((await env.buyerSdk.getTask(createdB.taskId)).status).to.equal("PROOF_SUBMITTED");

    // ── Settle Task A → SETTLED ──────────────────────────────────────────────

    const { result: resultA } = await verifyAndSettle({ env, taskId: createdA.taskId });

    expect(resultA.checks.modelMatched, "Task A: modelMatched should be true").to.equal(true);
    expect(resultA.report.passed, `Task A passed=false: ${JSON.stringify(resultA.checks)}`).to.equal(true);
    expect(resultA.report.settlement.action).to.equal("RELEASE");

    const taskAFinal = await env.buyerSdk.getTask(createdA.taskId);
    expect(taskAFinal.status).to.equal("SETTLED");

    // Task B is unaffected
    expect((await env.buyerSdk.getTask(createdB.taskId)).status).to.equal("PROOF_SUBMITTED");

    // ── Settle Task B → REFUNDED ─────────────────────────────────────────────

    const { result: resultB } = await verifyAndSettle({ env, taskId: createdB.taskId });

    expect(resultB.checks.modelMatched, "Task B: modelMatched should be false").to.equal(false);
    expect(resultB.report.passed).to.equal(false);
    expect(resultB.report.settlement.action).to.equal("REFUND");

    const taskBFinal = await env.buyerSdk.getTask(createdB.taskId);
    expect(taskBFinal.status).to.equal("REFUNDED");

    // ── Final balance assertions ─────────────────────────────────────────────

    // Seller received Task A payment only
    expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(DEFAULT_AMOUNT);

    // Escrow is fully drained
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);

    // Buyer spent DEFAULT_AMOUNT on Task A; Task B was refunded; also got the extra mint
    // Initial: INITIAL_BALANCE + DEFAULT_AMOUNT (extra mint)
    // Spent Task A (not refunded): -DEFAULT_AMOUNT
    // Task B was refunded: net 0
    expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(INITIAL_BALANCE);

    // Both proof bundle hashes are marked used on-chain after settlement,
    // regardless of RELEASE or REFUND — prevents replay attacks for both outcomes.
    expect(await env.settlement.usedProofBundleHash(taskAFinal.proofBundleHash!)).to.equal(true);
    expect(await env.settlement.usedProofBundleHash(taskBFinal.proofBundleHash!)).to.equal(true);
  });
});
