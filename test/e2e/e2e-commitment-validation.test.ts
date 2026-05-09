import { expect } from "chai";
import { ethers } from "hardhat";

import { type Bytes32 } from "@tyrpay/sdk-core";

import {
  deployE2eFixture,
  buildTestCommitment,
  submitCommitmentOnChain,
  currentTimeMs,
  DEFAULT_AMOUNT,
  type E2eEnvironment
} from "./helpers/setup";

/**
 * E2E-14: BuyerSdk Commitment Validation
 *
 * The BuyerSdk must validate the seller's commitment before funding.
 * If the commitment violates the buyer's constraints, fundTask must throw
 * without broadcasting a fund transaction, leaving the task COMMITMENT_SUBMITTED.
 */
describe("E2E-14: BuyerSdk Commitment Validation", function () {
  this.timeout(120_000);

  let env: E2eEnvironment;

  beforeEach(async function () {
    env = await deployE2eFixture();
  });

  // ─── Mismatched host ────────────────────────────────────────────────────────

  it("rejects funding when commitment target.host is not in acceptedHosts", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    // Seller commits to a different host than the buyer expects
    const maliciousCommitment = buildTestCommitment({
      taskId: created.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address,
      overrides: {
        target: {
          host: "evil.example.com",
          path: "/v1/chat/completions",
          method: "POST"
        }
      }
    });

    await submitCommitmentOnChain({
      env, taskId: created.taskId as Bytes32, commitment: maliciousCommitment
    });

    let fundError: unknown;
    try {
      await env.buyerSdk.fundTask(created.taskId, {
        validateCommitment: {
          acceptedHosts: ["api.openai.com"],
          acceptedModels: ["gpt-4.1-mini"],
          expectedVerifier: env.verifier.address
        }
      });
    } catch (err) {
      fundError = err;
    }

    expect(fundError, "fundTask should throw for mismatched host").to.not.be.undefined;

    // Task must remain COMMITMENT_SUBMITTED — funds were never locked
    const task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("COMMITMENT_SUBMITTED");
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
  });

  // ─── Unexpected verifier ────────────────────────────────────────────────────

  it("rejects funding when commitment verifier does not match expectedVerifier", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    // Seller commits a different (unregistered) verifier
    const maliciousCommitment = buildTestCommitment({
      taskId: created.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.stranger.address    // stranger is not the expected verifier
    });

    await submitCommitmentOnChain({
      env, taskId: created.taskId as Bytes32, commitment: maliciousCommitment
    });

    let fundError: unknown;
    try {
      await env.buyerSdk.fundTask(created.taskId, {
        validateCommitment: {
          acceptedHosts: ["api.openai.com"],
          acceptedModels: ["gpt-4.1-mini"],
          expectedVerifier: env.verifier.address
        }
      });
    } catch (err) {
      fundError = err;
    }

    expect(fundError, "fundTask should throw for mismatched verifier").to.not.be.undefined;

    // Task must remain COMMITMENT_SUBMITTED — no funds transferred
    const task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("COMMITMENT_SUBMITTED");
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
  });

  // ─── Mismatched allowedModels ────────────────────────────────────────────────

  it("rejects funding when commitment allowedModels does not include buyer-required models", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    // Seller commits to an unapproved model
    const badModelCommitment = buildTestCommitment({
      taskId: created.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address,
      overrides: { allowedModels: ["gpt-3.5-turbo"] }   // not in buyer's acceptedModels
    });

    await submitCommitmentOnChain({
      env, taskId: created.taskId as Bytes32, commitment: badModelCommitment
    });

    let fundError: unknown;
    try {
      await env.buyerSdk.fundTask(created.taskId, {
        validateCommitment: {
          acceptedHosts: ["api.openai.com"],
          acceptedModels: ["gpt-4.1-mini"],
          expectedVerifier: env.verifier.address
        }
      });
    } catch (err) {
      fundError = err;
    }

    expect(fundError, "fundTask should throw for disallowed model").to.not.be.undefined;

    const task = await env.buyerSdk.getTask(created.taskId);
    expect(task.status).to.equal("COMMITMENT_SUBMITTED");
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
  });
});
