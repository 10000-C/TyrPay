import { expect } from "chai";
import { ethers } from "hardhat";

import { SCHEMA_VERSIONS, hashVerificationReport, type Bytes32 } from "@fulfillpay/sdk-core";

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
 * E2E-13: Wrong EIP-712 Domain → UnauthorizedVerifier
 *
 * When a verifier signs the report using the correct key but the wrong EIP-712
 * domain (wrong chainId or wrong verifyingContract), ecrecover yields a different
 * address. The contract must reject the call with UnauthorizedVerifier.
 */
describe("E2E-13: Wrong EIP-712 Domain → UnauthorizedVerifier", function () {
  this.timeout(120_000);

  let env: E2eEnvironment;

  beforeEach(async function () {
    env = await deployE2eFixture();
  });

  async function setupProofSubmitted(): Promise<{
    taskId: string;
    commitmentHash: Bytes32;
    proofBundleHash: Bytes32;
    verifiedAt: bigint;
  }> {
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

    const { commitmentHash } = await submitCommitmentOnChain({
      env, taskId: created.taskId as Bytes32, commitment
    });

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

    return {
      taskId: created.taskId,
      commitmentHash,
      proofBundleHash: sellerResult.proofBundleHash,
      verifiedAt
    };
  }

  // ─── Wrong chainId ─────────────────────────────────────────────────────────

  it("rejects settle when EIP-712 domain uses wrong chainId", async function () {
    const { taskId, commitmentHash, proofBundleHash, verifiedAt } = await setupProofSubmitted();

    const reportHash = hashVerificationReport({
      schemaVersion: SCHEMA_VERSIONS.verificationReport,
      chainId: env.chainId.toString(),
      settlementContract: env.settlementAddress.toLowerCase(),
      taskId: taskId as Bytes32,
      buyer: env.buyer.address.toLowerCase() as Bytes32,
      seller: env.seller.address.toLowerCase() as Bytes32,
      commitmentHash,
      proofBundleHash,
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

    // Registered verifier signs but with WRONG chainId in domain
    const wrongChainSignature = await signVerificationReport({
      verifier: env.verifier,
      settlementAddress: env.settlementAddress,
      chainId: 99999n,          // wrong chain
      report
    });

    // The recovered signer from wrong-domain signature ≠ env.verifier → UnauthorizedVerifier
    await expect(
      env.settlement.settle(report, wrongChainSignature)
    ).to.be.revertedWithCustomError(env.settlement, "UnauthorizedVerifier");

    // Task remains PROOF_SUBMITTED
    const onChainTask = await env.settlement.getTask(taskId);
    expect(onChainTask.status).to.equal(3n);
  });

  // ─── Wrong verifyingContract ───────────────────────────────────────────────

  it("rejects settle when EIP-712 domain uses wrong verifyingContract", async function () {
    const { taskId, commitmentHash, proofBundleHash, verifiedAt } = await setupProofSubmitted();

    const reportHash = hashVerificationReport({
      schemaVersion: SCHEMA_VERSIONS.verificationReport,
      chainId: env.chainId.toString(),
      settlementContract: env.settlementAddress.toLowerCase(),
      taskId: taskId as Bytes32,
      buyer: env.buyer.address.toLowerCase() as Bytes32,
      seller: env.seller.address.toLowerCase() as Bytes32,
      commitmentHash,
      proofBundleHash,
      passed: false,
      checks: {
        commitmentHashMatched: true, proofBundleHashMatched: true, zkTlsProofValid: true,
        endpointMatched: true, taskContextMatched: true, callIndicesUnique: true,
        proofNotConsumed: true, withinTaskWindow: true, modelMatched: false, usageSatisfied: true
      },
      aggregateUsage: { totalTokens: 128 },
      settlement: { action: "REFUND", amount: DEFAULT_AMOUNT.toString() },
      verifier: env.verifier.address.toLowerCase() as Bytes32,
      verifiedAt: verifiedAt.toString()
    });

    const report = {
      taskId,
      buyer: env.buyer.address,
      seller: env.seller.address,
      commitmentHash,
      proofBundleHash,
      passed: false,
      settlementAction: 2,
      settlementAmount: DEFAULT_AMOUNT,
      verifiedAt,
      reportHash
    };

    // Registered verifier signs but with WRONG verifyingContract
    const fakeContractAddress = ethers.Wallet.createRandom().address;
    const wrongContractSignature = await signVerificationReport({
      verifier: env.verifier,
      settlementAddress: fakeContractAddress as `0x${string}`,
      chainId: env.chainId,
      report
    });

    await expect(
      env.settlement.settle(report, wrongContractSignature)
    ).to.be.revertedWithCustomError(env.settlement, "UnauthorizedVerifier");

    // Task remains PROOF_SUBMITTED
    const onChainTask = await env.settlement.getTask(taskId);
    expect(onChainTask.status).to.equal(3n);
  });
});
