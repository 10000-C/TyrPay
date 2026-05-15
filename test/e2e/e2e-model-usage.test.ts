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
 * E2E-02: Model Mismatch → REFUND
 * E2E-03: Usage Insufficient → REFUND
 *
 * These tests verify that the verifier correctly detects proof failures and the
 * contract processes a REFUND, returning funds to the buyer.
 */
describe("E2E-02/03: Model Mismatch & Usage Insufficient → REFUND", function () {
  this.timeout(120_000);

  let env: VerifierE2eEnvironment;

  beforeEach(async function () {
    env = await deployVerifierE2eFixture();
  });

  afterEach(async function () {
    await shutdownVerifier(env);
  });

  // ─── E2E-02: Model Mismatch ────────────────────────────────────────────────

  it("E2E-02: refunds buyer when observed model does not match commitment allowedModels", async function () {
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
      // allowedModels: ["gpt-4.1-mini"] — default
    });

    await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    // Seller generates proof where the adapter returns "gpt-4.1-mini-mismatch"
    // as the observed model — not in commitment.allowedModels
    await sellerFullFlow({
      env,
      commitment,
      taskNonce: created.taskNonce as Bytes32,
      scenario: "model_mismatch"
    });

    let task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("PROOF_SUBMITTED");

    // Real verifier detects model mismatch → REFUND
    const { result } = await verifyAndSettle({ env, taskId: created.taskId });

    expect(result.checks.modelMatched, "modelMatched should be false").to.equal(false);
    expect(
      result.report.passed,
      `Expected passed=false. checks=${JSON.stringify(result.checks)}`
    ).to.equal(false);
    expect(result.report.settlement.action).to.equal("REFUND");

    task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("REFUNDED");

    // Buyer recovers full amount; seller and escrow are empty
    expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(INITIAL_BALANCE);
    expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(0n);
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
  });

  // ─── E2E-03: Usage Insufficient ───────────────────────────────────────────

  it("E2E-03: refunds buyer when proof shows token usage below commitment minimum", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
    const minTokens = 500;

    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    // Commitment requires at least 500 tokens
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

    // Seller generates proof: usage_insufficient yields Math.max(0, minTokens - 1) = 499 tokens
    await sellerFullFlow({
      env,
      commitment,
      taskNonce: created.taskNonce as Bytes32,
      scenario: "usage_insufficient",
      commitmentMinTokens: minTokens
    });

    let task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("PROOF_SUBMITTED");

    // Real verifier: 499 >= 500 → false → usageSatisfied = false → REFUND
    const { result } = await verifyAndSettle({ env, taskId: created.taskId });

    expect(result.checks.usageSatisfied, "usageSatisfied should be false").to.equal(false);
    expect(
      result.report.passed,
      `Expected passed=false. checks=${JSON.stringify(result.checks)}`
    ).to.equal(false);
    expect(result.report.settlement.action).to.equal("REFUND");

    task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("REFUNDED");

    // Buyer recovers full amount; seller and escrow are empty
    expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(INITIAL_BALANCE);
    expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(0n);
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
  });
});
