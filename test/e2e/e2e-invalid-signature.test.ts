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

/**
 * E2E-12: Unregistered Verifier Signature Rejection
 * E2E-05 (additional cases): EmptyReportHash guard, tampered report binding
 *
 * These tests verify the contract's signature and report integrity checks by
 * manually crafting invalid reports and observing the expected reverts.
 */
describe("E2E-12/05: Invalid Report Signature & Integrity Rejection", function () {
  this.timeout(120_000);

  let env: E2eEnvironment;

  beforeEach(async function () {
    env = await deployE2eFixture();
  });

  // ─── E2E-12: Unregistered Verifier ────────────────────────────────────────

  it("E2E-12: rejects settlement with a signature from an unregistered verifier", async function () {
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

    await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    const sellerResult = await sellerFullFlow({
      env, commitment, taskNonce: created.taskNonce as Bytes32
    });

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
        commitmentHashMatched: true, proofBundleHashMatched: true, zkTlsProofValid: true,
        endpointMatched: true, taskContextMatched: true, callIndicesUnique: true,
        proofNotConsumed: true, withinTaskWindow: true, modelMatched: true, usageSatisfied: true
      },
      aggregateUsage: { totalTokens: 128 },
      settlement: { action: "RELEASE", amount: DEFAULT_AMOUNT.toString() },
      verifier: env.stranger.address.toLowerCase() as Bytes32,
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

    // Stranger (not registered in VerifierRegistry) signs
    const fakeSignature = await env.stranger.signTypedData(
      {
        name: "FulfillPay", version: "1",
        chainId: env.chainId, verifyingContract: env.settlementAddress
      },
      {
        VerificationReport: [
          { name: "taskId", type: "bytes32" }, { name: "buyer", type: "address" },
          { name: "seller", type: "address" }, { name: "commitmentHash", type: "bytes32" },
          { name: "proofBundleHash", type: "bytes32" }, { name: "passed", type: "bool" },
          { name: "settlementAction", type: "uint8" }, { name: "settlementAmount", type: "uint256" },
          { name: "verifiedAt", type: "uint256" }, { name: "reportHash", type: "bytes32" }
        ]
      },
      report
    );

    await expect(
      env.settlement.settle(report, fakeSignature)
    ).to.be.revertedWithCustomError(env.settlement, "UnauthorizedVerifier");
  });

  // ─── EmptyReportHash guard ────────────────────────────────────────────────

  it("rejects settlement with empty reportHash (ZeroHash)", async function () {
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

    await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    const sellerResult = await sellerFullFlow({
      env, commitment, taskNonce: created.taskNonce as Bytes32
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
      reportHash: ethers.ZeroHash
    };

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

  // ─── Tampered commitmentHash ───────────────────────────────────────────────

  it("rejects settlement with tampered commitmentHash (InvalidReportBinding)", async function () {
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

    await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
    await env.buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: env.verifier.address
      }
    });

    const sellerResult = await sellerFullFlow({
      env, commitment, taskNonce: created.taskNonce as Bytes32
    });

    const verifiedAt = BigInt(await env.settlement.currentTimeMs());
    const tamperedCommitmentHash = ethers.keccak256(ethers.toUtf8Bytes("tampered"));

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
        commitmentHashMatched: true, proofBundleHashMatched: true, zkTlsProofValid: true,
        endpointMatched: true, taskContextMatched: true, callIndicesUnique: true,
        proofNotConsumed: true, withinTaskWindow: true, modelMatched: true, usageSatisfied: true
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
      commitmentHash: tamperedCommitmentHash,
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

    await expect(
      env.settlement.settle(report, signature)
    ).to.be.revertedWithCustomError(env.settlement, "InvalidReportBinding");
  });
});
