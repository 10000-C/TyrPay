import { expect } from "chai";
import { ethers } from "hardhat";

import {
  deployVerifierE2eFixture,
  callVerifier,
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

describe("E2E-01: Happy Path — PASS → RELEASE", function () {
  this.timeout(120_000);

  let env: VerifierE2eEnvironment;

  beforeEach(async function () {
    env = await deployVerifierE2eFixture();
  });

  afterEach(async function () {
    await shutdownVerifier(env);
  });

  it("executes the full flow: create → commit → fund → proof → verifier → settle", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    // Step 1: Buyer creates task intent
    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs,
      metadataURI: "ipfs://e2e/task/happy"
    });

    const taskId = created.taskId;
    const taskNonce = created.taskNonce;
    expect(taskId).to.match(/^0x/);

    let task = await env.buyerSdk.getTask(taskId);
    expect(task.status).to.equal("INTENT_CREATED");
    expect(task.buyer).to.equal(env.buyer.address.toLowerCase());
    expect(task.seller).to.equal(env.seller.address.toLowerCase());

    // Step 2: Seller submits commitment
    const commitment = buildTestCommitment({
      taskId: taskId as `0x${string}`,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    await submitCommitmentOnChain({ env, taskId: taskId as `0x${string}`, commitment });

    task = await env.buyerSdk.getTask(taskId);
    expect(task.status).to.equal("COMMITMENT_SUBMITTED");

    // Step 3: Buyer validates commitment and funds task
    await env.buyerSdk.fundTask(taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedPaths: ["/v1/chat/completions"],
        acceptedMethods: ["POST"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address,
        minTotalTokens: 100,
        requireNonZeroMinUsage: true
      }
    });

    task = await env.buyerSdk.getTask(taskId);
    expect(task.status).to.equal("FUNDED");
    expect(await env.buyerSdk.getTaskStatus(taskId)).to.equal("EXECUTING");

    const escrowBalance = await env.mockToken.balanceOf(env.settlementAddress);
    expect(escrowBalance).to.equal(DEFAULT_AMOUNT);

    // Step 4: Seller runs full proof flow (observedAt = current EVM time, within window)
    await sellerFullFlow({
      env,
      commitment,
      taskNonce: taskNonce as `0x${string}`
    });

    task = await env.buyerSdk.getTask(taskId);
    expect(task.status).to.equal("PROOF_SUBMITTED");

    // Step 5: Real Verifier Service verifies and settles
    const { result } = await verifyAndSettle({ env, taskId });

    // Verifier checks must all pass
    expect(result.report.passed, `Verifier returned passed=false. checks=${JSON.stringify(result.checks)}`).to.equal(true);
    expect(result.checks.withinTaskWindow).to.equal(true);
    expect(result.checks.modelMatched).to.equal(true);
    expect(result.checks.usageSatisfied).to.equal(true);
    expect(result.report.settlement.action).to.equal("RELEASE");

    // Final state assertions
    task = await env.buyerSdk.getTask(taskId);
    expect(task.status).to.equal("SETTLED");

    expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(DEFAULT_AMOUNT);
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
    expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(
      INITIAL_BALANCE - DEFAULT_AMOUNT
    );

    expect(await env.settlement.usedProofBundleHash(task.proofBundleHash!)).to.equal(true);
  });
});
