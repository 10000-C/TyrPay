import { expect } from "chai";
import { ethers } from "hardhat";

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

describe("E2E-05: Invalid Verifier Signature Rejection", function () {
  this.timeout(120_000);

  let env: E2eEnvironment;

  beforeEach(async function () {
    env = await deployE2eFixture();
  });

  it("rejects settlement with a non-registered verifier signature", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    // Create and fund task
    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs
    });

    const commitment = buildTestCommitment({
      taskId: created.taskId as `0x${string}`,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    const commitmentResult = await submitCommitmentOnChain({
      env, taskId: created.taskId as `0x${string}`, commitment
    });

    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    // Seller submits proof
    const sellerResult = await sellerFullFlow({
      env,
      commitment,
      taskNonce: created.taskNonce as `0x${string}`
    });

    // Build report
    const verifiedAt = BigInt(await env.settlement.currentTimeMs());
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report/bad-verifier"));

    const report = {
      taskId: created.taskId,
      buyer: env.buyer.address,
      seller: env.seller.address,
      commitmentHash: commitmentResult.commitmentHash,
      proofBundleHash: sellerResult.proofBundleHash,
      passed: false,
      settlementAction: 2,
      settlementAmount: DEFAULT_AMOUNT,
      verifiedAt,
      reportHash
    };

    // Sign with stranger (non-registered verifier)
    const badSignature = await signVerificationReport({
      verifier: env.stranger,
      settlementAddress: env.settlementAddress,
      chainId: env.chainId,
      report
    });

    await expect(
      env.settlement.settle(report, badSignature)
    ).to.be.revertedWithCustomError(env.settlement, "UnauthorizedVerifier");

    // Task should remain PROOF_SUBMITTED
    const storedTask = await env.settlement.getTask(created.taskId);
    expect(storedTask.status).to.equal(3n);
  });
});