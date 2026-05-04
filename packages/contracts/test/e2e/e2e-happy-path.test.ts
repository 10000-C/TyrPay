import { expect } from "chai";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  hashProofBundle,
  hashVerificationReport,
  buildVerificationReportTypedData,
  type ExecutionCommitment,
  type VerificationReport
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

describe("E2E-01: Happy Path — PASS → RELEASE", function () {
  this.timeout(120_000);

  let env: E2eEnvironment;
  let taskId: string;
  let taskNonce: string;
  let commitment: ExecutionCommitment;
  let commitmentHash: string;
  let proofBundleHash: string;

  beforeEach(async function () {
    env = await deployE2eFixture();
  });

  it("executes the full flow: create → commit → fund → proof → settle", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    // Step 1: Buyer creates task intent
    const created = await env.buyerSdk.createTaskIntent({
      seller: env.seller.address,
      token: await ethers.resolveAddress(env.mockToken),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs,
      metadataURI: "ipfs://e2e/task/happy"
    });

    taskId = created.taskId;
    taskNonce = created.taskNonce;
    expect(taskId).to.match(/^0x/);

    // Verify task is on-chain with INTENT_CREATED status
    let task = await env.buyerSdk.getTask(taskId);
    expect(task.status).to.equal("INTENT_CREATED");
    expect(task.buyer).to.equal(env.buyer.address.toLowerCase());
    expect(task.seller).to.equal(env.seller.address.toLowerCase());

    // Step 2: Seller submits commitment
    commitment = buildTestCommitment({
      taskId: taskId as `0x${string}`,
      buyer: env.buyer.address,
      seller: env.seller.address,
      deadlineMs,
      verifier: env.verifier.address
    });

    const commitmentResult = await submitCommitmentOnChain({ env, taskId: taskId as `0x${string}`, commitment });
    commitmentHash = commitmentResult.commitmentHash;

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

    // Verify derived status is EXECUTING
    const derivedStatus = await env.buyerSdk.getTaskStatus(taskId);
    expect(derivedStatus).to.equal("EXECUTING");

    // Verify escrow is locked
    const escrowBalance = await env.mockToken.balanceOf(env.settlementAddress);
    expect(escrowBalance).to.equal(DEFAULT_AMOUNT);

    // Step 4: Seller executes full flow (provenFetch → buildProof → upload → submit)
    const sellerResult = await sellerFullFlow({
      env,
      commitment,
      taskNonce: taskNonce as `0x${string}`
    });

    proofBundleHash = sellerResult.proofBundleHash;

    task = await env.buyerSdk.getTask(taskId);
    expect(task.status).to.equal("PROOF_SUBMITTED");

    // Step 5: Sign verification report and settle
    const verifiedAt = BigInt(await env.settlement.currentTimeMs());
    const reportHash = hashVerificationReport({
      schemaVersion: SCHEMA_VERSIONS.verificationReport,
      chainId: env.chainId.toString(),
      settlementContract: env.settlementAddress.toLowerCase(),
      taskId: taskId as `0x${string}`,
      buyer: env.buyer.address.toLowerCase() as `0x${string}`,
      seller: env.seller.address.toLowerCase() as `0x${string}`,
      commitmentHash,
      proofBundleHash,
      passed: true,
      checks: {
        commitmentHashMatched: true,
        proofBundleHashMatched: true,
        zkTlsProofValid: true,
        endpointMatched: true,
        taskContextMatched: true,
        callIndicesUnique: true,
        proofNotConsumed: true,
        withinTaskWindow: true,
        modelMatched: true,
        usageSatisfied: true
      },
      aggregateUsage: { totalTokens: 128 },
      settlement: { action: "RELEASE" as const, amount: "1000000" },
      verifier: env.verifier.address.toLowerCase() as `0x${string}`,
      verifiedAt: verifiedAt.toString()
    });

    const report = {
      taskId,
      buyer: env.buyer.address,
      seller: env.seller.address,
      commitmentHash,
      proofBundleHash,
      passed: true,
      settlementAction: 1,
      settlementAmount: DEFAULT_AMOUNT,
      verifiedAt,
      reportHash
    };

    const signature = await signVerificationReport({
      verifier: env.verifier,
      settlementAddress: env.settlementAddress,
      chainId: env.chainId,
      report
    });

    // Step 6: Settle on-chain
    await expect(env.settlement.settle(report, signature))
      .to.emit(env.settlement, "TaskSettled");

    // Final assertions
    task = await env.buyerSdk.getTask(taskId);
    expect(task.status).to.equal("SETTLED");

    // Seller received payment
    expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(DEFAULT_AMOUNT);

    // Escrow is empty
    expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);

    // Buyer balance decreased
    const buyerBalance = await env.mockToken.balanceOf(env.buyer.address);
    expect(buyerBalance).to.equal(9_000_000n);

    // Proof bundle is marked as used
    expect(await env.settlement.usedProofBundleHash(proofBundleHash)).to.equal(true);
  });
});