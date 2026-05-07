import { expect } from "chai";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  type ExecutionCommitment
} from "@fulfillpay/sdk-core";

import {
  deployE2eFixture,
  buildTestCommitment,
  submitCommitmentOnChain,
  sellerFullFlow,
  signVerificationReport,
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

    // === Task 1: Create, fund, proof, settle (PASS) ===
    const created1 = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitment1 = buildTestCommitment({
      taskId: created1.taskId as `0x${string}`,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    await submitCommitmentOnChain({ env, taskId: created1.taskId as `0x${string}`, commitment: commitment1 });

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
      taskNonce: created1.taskNonce as `0x${string}`
    });

    const sharedProofBundleHash = sellerResult1.proofBundleHash;

    // Settle Task 1
    const task1 = await env.buyerSdk.getTask(created1.taskId);
    const verifiedAt1 = BigInt(await env.settlement.currentTimeMs());
    const report1 = {
      taskId: created1.taskId,
      buyer: env.buyer.address,
      seller: env.seller.address,
      commitmentHash: task1.commitmentHash,
      proofBundleHash: sharedProofBundleHash,
      passed: true,
      settlementAction: 1,
      settlementAmount: DEFAULT_AMOUNT,
      verifiedAt: verifiedAt1,
      reportHash: ethers.keccak256(ethers.toUtf8Bytes("report/task1"))
    };

    const sig1 = await signVerificationReport({
      verifier: env.verifier,
      settlementAddress: env.settlementAddress,
      chainId: env.chainId,
      report: report1
    });

    await expect(env.settlement.settle(report1, sig1))
      .to.emit(env.settlement, "TaskSettled");

    // === Task 2: Try to reuse the same proofBundleHash ===
    const created2 = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitment2 = buildTestCommitment({
      taskId: created2.taskId as `0x${string}`,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    await submitCommitmentOnChain({ env, taskId: created2.taskId as `0x${string}`, commitment: commitment2 });

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
      .submitProofBundle(created2.taskId, sharedProofBundleHash, "ipfs://proof-bundles/replay");

    // Try to settle Task 2 with the reused proofBundleHash
    const task2 = await env.buyerSdk.getTask(created2.taskId);
    const verifiedAt2 = BigInt(await env.settlement.currentTimeMs());
    const report2 = {
      taskId: created2.taskId,
      buyer: env.buyer.address,
      seller: env.seller.address,
      commitmentHash: task2.commitmentHash,
      proofBundleHash: sharedProofBundleHash,
      passed: false,
      settlementAction: 2,
      settlementAmount: DEFAULT_AMOUNT,
      verifiedAt: verifiedAt2,
      reportHash: ethers.keccak256(ethers.toUtf8Bytes("report/task2"))
    };

    const sig2 = await signVerificationReport({
      verifier: env.verifier,
      settlementAddress: env.settlementAddress,
      chainId: env.chainId,
      report: report2
    });

    await expect(
      env.settlement.settle(report2, sig2)
    ).to.be.revertedWithCustomError(env.settlement, "ProofBundleAlreadyUsed");
  });
});