import { expect } from "chai";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  hashVerificationReport,
  type Bytes32
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

describe("E2E-03: Invalid Signature Rejection", function () {
  this.timeout(120_000);

  let env: E2eEnvironment;

  beforeEach(async function () {
    env = await deployE2eFixture();
  });

  it("rejects settlement with a signature from an unregistered verifier", async function () {
    const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

    // Create and fund task
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

    await submitCommitmentOnChain({
      env,
      taskId: created.taskId as Bytes32,
      commitment
    });

    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    // Seller submits proof bundle
    const sellerResult = await sellerFullFlow({
      env,
      commitment,
      taskNonce: created.taskNonce as Bytes32
    });

    // Get a stranger signer (not registered as verifier)
    const [, , , , stranger] = await ethers.getSigners();

    const task = await env.buyerSdk.getTask(created.taskId);
    const verifiedAt = BigInt(await env.settlement.currentTimeMs());

    const reportHash = hashVerificationReport({
      schemaVersion: SCHEMA_VERSIONS.verificationReport,
      chainId: env.chainId.toString(),
      settlementContract: env.settlementAddress.toLowerCase(),
      taskId: created.taskId as Bytes32,
      buyer: env.buyer.address.toLowerCase() as Bytes32,
      seller: env.seller.address.toLowerCase() as Bytes32,
      commitmentHash: task.commitmentHash!,
      proofBundleHash: sellerResult.proofBundleHash,
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
      settlement: { action: "RELEASE", amount: DEFAULT_AMOUNT.toString() },
      verifier: stranger.address.toLowerCase() as Bytes32,
      verifiedAt: verifiedAt.toString()
    });

    const report = {
      taskId: created.taskId,
      buyer: env.buyer.address,
      seller: env.seller.address,
      commitmentHash: task.commitmentHash!,
      proofBundleHash: sellerResult.proofBundleHash,
      passed: true,
      settlementAction: 1,
      settlementAmount: DEFAULT_AMOUNT,
      verifiedAt,
      reportHash
    };

    // Sign with stranger (unregistered verifier)
    const fakeSignature = await stranger.signTypedData(
      {
        name: "FulfillPay",
        version: "1",
        chainId: env.chainId,
        verifyingContract: env.settlementAddress
      },
      {
        VerificationReport: [
          { name: "taskId", type: "bytes32" },
          { name: "buyer", type: "address" },
          { name: "seller", type: "address" },
          { name: "commitmentHash", type: "bytes32" },
          { name: "proofBundleHash", type: "bytes32" },
          { name: "passed", type: "bool" },
          { name: "settlementAction", type: "uint8" },
          { name: "settlementAmount", type: "uint256" },
          { name: "verifiedAt", type: "uint256" },
          { name: "reportHash", type: "bytes32" }
        ]
      },
      report
    );

    await expect(
      env.settlement.settle(report, fakeSignature)
    ).to.be.revertedWithCustomError(env.settlement, "UnauthorizedVerifier");
  });

  it("rejects settlement with empty report hash (ZeroHash)", async function () {
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

    await submitCommitmentOnChain({
      env,
      taskId: created.taskId as Bytes32,
      commitment
    });

    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    const sellerResult = await sellerFullFlow({
      env,
      commitment,
      taskNonce: created.taskNonce as Bytes32
    });

    const task = await env.buyerSdk.getTask(created.taskId);
    const verifiedAt = BigInt(await env.settlement.currentTimeMs());

    const report = {
      taskId: created.taskId,
      buyer: env.buyer.address,
      seller: env.seller.address,
      commitmentHash: task.commitmentHash!,
      proofBundleHash: sellerResult.proofBundleHash,
      passed: true,
      settlementAction: 1,
      settlementAmount: DEFAULT_AMOUNT,
      verifiedAt,
      reportHash: ethers.ZeroHash // Empty hash!
    };

    // Sign with legitimate verifier but empty reportHash
    const signature = await signVerificationReport({
      verifier: env.verifier,
      settlementAddress: env.settlementAddress,
      chainId: env.chainId,
      report
    });

    await expect(
      env.settlement.settle(report, signature)
    ).to.be.revertedWithCustomError(env.settlement, "EmptyReportHash");
  });

  it("rejects settlement with tampered report fields (wrong commitmentHash)", async function () {
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

    await submitCommitmentOnChain({
      env,
      taskId: created.taskId as Bytes32,
      commitment
    });

    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    const sellerResult = await sellerFullFlow({
      env,
      commitment,
      taskNonce: created.taskNonce as Bytes32
    });

    const task = await env.buyerSdk.getTask(created.taskId);
    const verifiedAt = BigInt(await env.settlement.currentTimeMs());

    // Tamper with commitmentHash
    const tamperedCommitmentHash = ethers.keccak256(
      ethers.toUtf8Bytes("tampered")
    );

    const reportHash = hashVerificationReport({
      schemaVersion: SCHEMA_VERSIONS.verificationReport,
      chainId: env.chainId.toString(),
      settlementContract: env.settlementAddress.toLowerCase(),
      taskId: created.taskId as Bytes32,
      buyer: env.buyer.address.toLowerCase() as Bytes32,
      seller: env.seller.address.toLowerCase() as Bytes32,
      commitmentHash: tamperedCommitmentHash,
      proofBundleHash: sellerResult.proofBundleHash,
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
      settlement: { action: "RELEASE", amount: DEFAULT_AMOUNT.toString() },
      verifier: env.verifier.address.toLowerCase() as Bytes32,
      verifiedAt: verifiedAt.toString()
    });

    const report = {
      taskId: created.taskId,
      buyer: env.buyer.address,
      seller: env.seller.address,
      commitmentHash: tamperedCommitmentHash, // Wrong!
      proofBundleHash: sellerResult.proofBundleHash,
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

    // Should fail because commitmentHash doesn't match on-chain task
    await expect(
      env.settlement.settle(report, signature)
    ).to.be.revertedWithCustomError(env.settlement, "InvalidReportBinding");
  });
});