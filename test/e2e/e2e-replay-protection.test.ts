import { expect } from "chai";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  hashVerificationReport,
  type Bytes32
} from "@tyrpay/sdk-core";

import {
  deployE2eFixture,
  buildTestCommitment,
  submitCommitmentOnChain,
  sellerFullFlow,
  buildAndSignReport,
  currentTimeMs,
  DEFAULT_AMOUNT,
  type E2eEnvironment
} from "./helpers/setup";

describe("E2E-04: Proof Bundle Replay Protection", function () {
  this.timeout(120_000);

  let env: E2eEnvironment;

  beforeEach(async function () {
    env = await deployE2eFixture();
  });

  it("rejects reusing a proof bundle hash across different tasks", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    // === Task 1: full happy path ===
    const created1 = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitment1 = buildTestCommitment({
      taskId: created1.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    const commitmentResult1 = await submitCommitmentOnChain({
      env, taskId: created1.taskId as Bytes32, commitment: commitment1
    });

    await env.buyerSdk.fundTask(created1.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    const sellerResult1 = await sellerFullFlow({
      env,
      commitment: commitment1,
      taskNonce: created1.taskNonce as Bytes32
    });

    const sharedProofBundleHash = sellerResult1.proofBundleHash;

    // Settle Task 1 with a properly computed reportHash
    const { report: report1, signature: sig1 } = await buildAndSignReport({
      env,
      taskId: created1.taskId,
      commitmentHash: commitmentResult1.commitmentHash,
      proofBundleHash: sharedProofBundleHash,
      passed: true
    });

    await expect(env.settlement.settle(report1, sig1))
      .to.emit(env.settlement, "TaskSettled");

    expect(await env.settlement.usedProofBundleHash(sharedProofBundleHash)).to.equal(true);

    // === Task 2: try to reuse the same proofBundleHash ===
    const created2 = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitment2 = buildTestCommitment({
      taskId: created2.taskId as Bytes32,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    const commitmentResult2 = await submitCommitmentOnChain({
      env, taskId: created2.taskId as Bytes32, commitment: commitment2
    });

    await env.buyerSdk.fundTask(created2.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    // Submit the SAME proofBundleHash for Task 2
    await env.settlement
      .connect(env.seller)
      .submitProofBundle(
        created2.taskId,
        sharedProofBundleHash,
        sellerResult1.proofBundleURI
      );

    // Try to settle Task 2 with the reused proofBundleHash — contract must reject
    const { report: report2, signature: sig2 } = await buildAndSignReport({
      env,
      taskId: created2.taskId,
      commitmentHash: commitmentResult2.commitmentHash,
      proofBundleHash: sharedProofBundleHash,
      passed: false
    });

    await expect(
      env.settlement.settle(report2, sig2)
    ).to.be.revertedWithCustomError(env.settlement, "ProofBundleAlreadyUsed");
  });
});
