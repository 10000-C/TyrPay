import { expect } from "chai";
import { ethers } from "hardhat";

import {
  deployE2eFixture,
  buildTestCommitment,
  submitCommitmentOnChain,
  sellerFullFlow,
  signVerificationReport,
  currentTimeMs,
  increaseTime,
  GRACE_PERIOD_MS,
  VERIFICATION_TIMEOUT_MS,
  DEFAULT_AMOUNT,
  type E2eEnvironment
} from "./helpers/setup";

describe("E2E-10/11: Timeout Refund Scenarios", function () {
  this.timeout(120_000);

  let env: E2eEnvironment;

  beforeEach(async function () {
    env = await deployE2eFixture();
  });

  describe("E2E-10: Refund after proof submission deadline", function () {
    it("refunds buyer when seller does not submit proof in time", async function () {
      const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

      // Create task
      const created = await env.buyerSdk.createTaskIntent({
        seller: env.seller.address,
        token: await ethers.resolveAddress(env.mockToken),
        amount: 40_000n,
        deadline: deadlineMs
      });

      // Submit commitment and fund
      const commitment = buildTestCommitment({
        taskId: created.taskId as `0x${string}`,
        buyer: env.buyer.address,
        seller: env.seller.address,
        deadlineMs,
        verifier: env.verifier.address
      });

      await submitCommitmentOnChain({ env, taskId: created.taskId as `0x${string}`, commitment });

      await env.buyerSdk.fundTask(created.taskId, {
        validateCommitment: {
          acceptedHosts: ["api.openai.com"],
          acceptedModels: ["gpt-4.1-mini"],
          expectedVerifier: env.verifier.address
        }
      });

      // Verify escrow is locked
      expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(40_000n);

      // Advance time past deadline + grace period (60min + 15min = 75min = 4500s)
      await increaseTime(76 * 60);

      // Buyer refunds
      await env.buyerSdk.refundAfterProofSubmissionDeadline(created.taskId);

      // Verify refund
      const status = await env.buyerSdk.getTaskStatus(created.taskId);
      expect(status).to.equal("REFUNDED");

      // Buyer got money back
      expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(10_000_000n);

      // Escrow is empty
      expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
    });
  });

  describe("E2E-11: Refund after verification timeout", function () {
    it("refunds buyer when verification is not completed in time", async function () {
      const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

      // Create task
      const created = await env.buyerSdk.createTaskIntent({
        seller: env.seller.address,
        token: await ethers.resolveAddress(env.mockToken),
        amount: 50_000n,
        deadline: deadlineMs
      });

      // Submit commitment and fund
      const commitment = buildTestCommitment({
        taskId: created.taskId as `0x${string}`,
        buyer: env.buyer.address,
        seller: env.seller.address,
        deadlineMs,
        verifier: env.verifier.address
      });

      await submitCommitmentOnChain({ env, taskId: created.taskId as `0x${string}`, commitment });

      await env.buyerSdk.fundTask(created.taskId, {
        validateCommitment: {
          acceptedHosts: ["api.openai.com"],
          acceptedModels: ["gpt-4.1-mini"],
          expectedVerifier: env.verifier.address
        }
      });

      // Seller submits proof bundle
      await sellerFullFlow({
        env,
        commitment,
        taskNonce: created.taskNonce as `0x${string}`
      });

      // Verify task is PROOF_SUBMITTED
      const taskBeforeTimeout = await env.buyerSdk.getTask(created.taskId);
      expect(taskBeforeTimeout.status).to.equal("PROOF_SUBMITTED");

      // Advance time past verification timeout (60min + 1min buffer = 61min)
      await increaseTime(61 * 60);

      // Buyer refunds
      await env.buyerSdk.refundAfterVerificationTimeout(created.taskId);

      // Verify refund
      const status = await env.buyerSdk.getTaskStatus(created.taskId);
      expect(status).to.equal("REFUNDED");

      // Buyer got money back
      expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(10_000_000n);

      // Escrow is empty
      expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
    });
  });

  describe("E2E-09: Task expires → EXPIRED derived status", function () {
    it("shows EXPIRED derived status after deadline passes without funding", async function () {
      // Create task with short deadline (5 seconds)
      const block = await ethers.provider.getBlock("latest");
      const shortDeadlineMs = BigInt(block!.timestamp + 5) * 1000n;

      const created = await env.buyerSdk.createTaskIntent({
        seller: env.seller.address,
        token: await ethers.resolveAddress(env.mockToken),
        amount: 3_000_000n,
        deadline: shortDeadlineMs
      });

      // Submit commitment (but don't fund)
      const commitment = buildTestCommitment({
        taskId: created.taskId as `0x${string}`,
        buyer: env.buyer.address,
        seller: env.seller.address,
        deadlineMs: shortDeadlineMs,
        verifier: env.verifier.address
      });

      await submitCommitmentOnChain({ env, taskId: created.taskId as `0x${string}`, commitment });

      // Advance past deadline
      await increaseTime(10);

      // Derived status should be EXPIRED
      const derivedStatus = await env.buyerSdk.getTaskStatus(created.taskId);
      expect(derivedStatus).to.equal("EXPIRED");

      // On-chain status is still COMMITMENT_SUBMITTED (index 1)
      const onChainTask = await env.settlement.getTask(created.taskId);
      expect(onChainTask.status).to.equal(1n);
    });
  });
});