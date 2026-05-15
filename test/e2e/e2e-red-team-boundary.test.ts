/**
 * E2E Red-Team Boundary Tests — Cross-Component Integration Bug Hunter
 *
 * Tests are split into two parts:
 *
 * Part A: "Known-correct behavior" — these must all PASS.
 *         Verifies the system works correctly in known-good scenarios.
 *
 * Part B: "Regression guards" — previously failing assertions caused by
 *         infrastructure bugs (F-01…F-07). Each test documents and locks in
 *         the correct behavior after the underlying root cause was fixed:
 *
 *   F-01: observedAt used DEFAULT_MOCK_OBSERVED_AT (2025-01-01) ← fixed: EVM time
 *   F-02: wrong URI passed to submitProofBundle ← fixed: use proofBundleURI
 *   F-03: verifier clock used Date.now() not EVM time ← fixed: EVM clock
 *   F-04: sellerFullFlow ignored scenario param ← fixed: MockZkTlsAdapter direct call
 *   F-05: VerifierInvalidTaskStateError → HTTP 400 (correct, not 409)
 *   F-06: usageSatisfied used >= (correct; equality must satisfy)
 *   F-07: EmptyReportHash checked before signature (correct check order)
 */
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  hashVerificationReport,
  type Bytes32,
  type ExecutionCommitment,
  type ProofBundle
} from "@tyrpay/sdk-core";

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
  signVerificationReport,
  buildAndSignReport,
  currentTimeMs,
  increaseTime,
  DEFAULT_AMOUNT,
  INITIAL_BALANCE
} from "./helpers/setup";

import { toSettlementReportStruct } from "@tyrpay/verifier-service";
import { BuyerSdk } from "@tyrpay/buyer-sdk";

// ─── Shared helper ───────────────────────────────────────────────────────────

interface TaskAtProofSubmitted {
  taskId: string;
  taskNonce: string;
  commitment: ExecutionCommitment;
  commitmentHash: string;
  proofBundleHash: string;
  proofBundleURI: string;
  proofBundle: ProofBundle;
  deadlineMs: bigint;
}

async function setupTaskToProofSubmitted(input: {
  env: VerifierE2eEnvironment;
  commitmentOverrides?: Partial<ExecutionCommitment>;
  scenario?: import("./helpers/setup").MockScenario;
  totalTokens?: number;
  commitmentMinTokens?: number;
}): Promise<TaskAtProofSubmitted> {
  const { env } = input;
  const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

  const created = await env.buyerSdk.createTaskIntent({
    seller: env.seller.address,
    token: await ethers.resolveAddress(env.mockToken),
    amount: DEFAULT_AMOUNT,
    deadline: deadlineMs,
    metadataURI: "ipfs://e2e/red-team"
  });

  const commitment = buildTestCommitment({
    taskId: created.taskId as Bytes32,
    buyer: env.buyer.address,
    seller: env.seller.address,
    deadlineMs,
    verifier: env.verifier.address,
    overrides: input.commitmentOverrides
  });

  const commitmentResult = await submitCommitmentOnChain({
    env, taskId: created.taskId as Bytes32, commitment
  });

  await env.buyerSdk.fundTask(created.taskId, {
    validateCommitment: { expectedVerifier: env.verifier.address }
  });

  const sellerResult = await sellerFullFlow({
    env,
    commitment,
    taskNonce: created.taskNonce as Bytes32,
    scenario: input.scenario ?? "pass",
    totalTokens: input.totalTokens,
    commitmentMinTokens: input.commitmentMinTokens
  });

  return {
    taskId: created.taskId,
    taskNonce: created.taskNonce,
    commitment,
    commitmentHash: commitmentResult.commitmentHash,
    proofBundleHash: sellerResult.proofBundleHash,
    proofBundleURI: sellerResult.proofBundleURI,
    proofBundle: sellerResult.proofBundle,
    deadlineMs
  };
}

async function manuallySettle(input: {
  env: VerifierE2eEnvironment;
  taskId: string;
  commitmentHash: string;
  proofBundleHash: string;
  passed?: boolean;
}): Promise<void> {
  const { env, taskId, commitmentHash, proofBundleHash, passed = true } = input;
  const { report, signature } = await buildAndSignReport({
    env, taskId, commitmentHash, proofBundleHash, passed
  });
  const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
  await (await contract.settle(report, signature)).wait();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Part A: Known-correct behavior — all tests MUST pass
// ═══════════════════════════════════════════════════════════════════════════

describe("E2E Red-Team: Cross-Component Boundary Tests", function () {
  this.timeout(180_000);

  let env: VerifierE2eEnvironment;

  beforeEach(async function () {
    env = await deployVerifierE2eFixture();
  });

  afterEach(async function () {
    await shutdownVerifier(env);
  });

  describe("Part A: Known Correct Behavior Verification", function () {

    describe("A-01: Manual settlement (bypass verifier service)", function () {
      it("RELEASE: manual settle succeeds, seller receives payment", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        await manuallySettle({ env, taskId, commitmentHash, proofBundleHash, passed: true });

        const task = await env.buyerSdk.getTask(taskId);
        expect(task.status).to.equal("SETTLED");
        expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(DEFAULT_AMOUNT);
        expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
      });

      it("REFUND: manual refund succeeds, buyer recovers funds", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        await manuallySettle({ env, taskId, commitmentHash, proofBundleHash, passed: false });

        const task = await env.buyerSdk.getTask(taskId);
        expect(task.status).to.equal("REFUNDED");
        expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(INITIAL_BALANCE);
      });
    });

    describe("A-02: Contract access control", function () {
      it("non-seller cannot submitCommitment → OnlySeller", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
        const fakeHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

        await expect(
          contract.connect(env.stranger).submitCommitment(created.taskId, fakeHash, "memory://fake")
        ).to.be.revertedWithCustomError(contract, "OnlySeller");
      });

      it("non-seller cannot submitProofBundle → OnlySeller", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitment = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: env.buyer.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
        await env.buyerSdk.fundTask(created.taskId, {
          validateCommitment: { expectedVerifier: env.verifier.address }
        });
        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
        const fakeHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

        await expect(
          contract.connect(env.stranger).submitProofBundle(created.taskId, fakeHash, "memory://fake")
        ).to.be.revertedWithCustomError(contract, "OnlySeller");
      });

      it("unregistered verifier signature → UnauthorizedVerifier", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        const nonZeroReportHash = ethers.keccak256(ethers.toUtf8Bytes("fake-report"));
        const report = {
          taskId, buyer: env.buyer.address, seller: env.seller.address,
          commitmentHash, proofBundleHash, passed: true,
          settlementAction: 1, settlementAmount: DEFAULT_AMOUNT,
          verifiedAt: BigInt(await env.settlement.currentTimeMs()),
          reportHash: nonZeroReportHash
        };

        const fakeSignature = await env.stranger.signTypedData(
          { name: "TyrPay", version: "1", chainId: env.chainId, verifyingContract: env.settlementAddress },
          { VerificationReport: [
            { name: "taskId", type: "bytes32" }, { name: "buyer", type: "address" },
            { name: "seller", type: "address" }, { name: "commitmentHash", type: "bytes32" },
            { name: "proofBundleHash", type: "bytes32" }, { name: "passed", type: "bool" },
            { name: "settlementAction", type: "uint8" }, { name: "settlementAmount", type: "uint256" },
            { name: "verifiedAt", type: "uint256" }, { name: "reportHash", type: "bytes32" }
          ] },
          report
        );

        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
        await expect(contract.settle(report, fakeSignature))
          .to.be.revertedWithCustomError(contract, "UnauthorizedVerifier");
      });
    });

    describe("A-03: State machine enforcement", function () {
      it("FUNDED task cannot re-submit commitment → InvalidTaskState", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitment = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: env.buyer.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
        await env.buyerSdk.fundTask(created.taskId, {
          validateCommitment: { expectedVerifier: env.verifier.address }
        });

        const commitment2 = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: env.buyer.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address,
          overrides: { allowedModels: ["other-model"] }
        });
        const pointer = await env.storage.putObject(commitment2, { namespace: "commitments" });
        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);

        await expect(
          contract.connect(env.seller).submitCommitment(created.taskId, pointer.hash, pointer.uri)
        ).to.be.revertedWithCustomError(contract, "InvalidTaskState");
      });

      it("INTENT_CREATED cannot be funded without a commitment → SDK rejects", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });

        await expect(env.buyerSdk.fundTask(created.taskId)).to.be.rejected;
      });

      it("double settlement rejected → InvalidTaskState (already SETTLED)", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        await manuallySettle({ env, taskId, commitmentHash, proofBundleHash, passed: true });

        const { report: dupReport, signature: dupSig } = await buildAndSignReport({
          env, taskId, commitmentHash, proofBundleHash, passed: true
        });
        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
        await expect(contract.settle(dupReport, dupSig))
          .to.be.revertedWithCustomError(contract, "InvalidTaskState");
      });

      it("buyer/seller address swap → InvalidReportBinding", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        const verifiedAt = BigInt(await env.settlement.currentTimeMs());
        const reportHash = hashVerificationReport({
          schemaVersion: SCHEMA_VERSIONS.verificationReport,
          chainId: env.chainId.toString(),
          settlementContract: env.settlementAddress.toLowerCase(),
          taskId: taskId as Bytes32,
          buyer: env.seller.address.toLowerCase() as Bytes32,
          seller: env.buyer.address.toLowerCase() as Bytes32,
          commitmentHash, proofBundleHash, passed: true,
          checks: {
            commitmentHashMatched: true, proofBundleHashMatched: true, zkTlsProofValid: true,
            endpointMatched: true, taskContextMatched: true, callIndicesUnique: true,
            proofNotConsumed: true, withinTaskWindow: true, modelMatched: true, usageSatisfied: true
          },
          aggregateUsage: { totalTokens: 128 },
          settlement: { action: "RELEASE", amount: "1000000" },
          verifier: env.verifier.address.toLowerCase() as Bytes32,
          verifiedAt: verifiedAt.toString()
        });

        const swappedReport = {
          taskId, buyer: env.seller.address, seller: env.buyer.address,
          commitmentHash, proofBundleHash, passed: true,
          settlementAction: 1, settlementAmount: DEFAULT_AMOUNT,
          verifiedAt, reportHash
        };
        const sig = await signVerificationReport({
          verifier: env.verifier, settlementAddress: env.settlementAddress,
          chainId: env.chainId, report: swappedReport
        });

        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
        await expect(contract.settle(swappedReport, sig))
          .to.be.revertedWithCustomError(contract, "InvalidReportBinding");
      });
    });

    describe("A-04: Verifier registry mid-flight change", function () {
      it("verifier removed after signing → UnauthorizedVerifier", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        const { report, signature } = await buildAndSignReport({
          env, taskId, commitmentHash, proofBundleHash, passed: true
        });

        // Remove verifier AFTER signing but BEFORE settling
        await (await env.verifierRegistry.removeVerifier(env.verifier.address)).wait();

        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
        await expect(contract.settle(report, signature))
          .to.be.revertedWithCustomError(contract, "UnauthorizedVerifier");
      });
    });

    describe("A-05: Timeout and deadline refund", function () {
      it("buyer refunds after proof submission deadline expires", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitment = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: env.buyer.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
        await env.buyerSdk.fundTask(created.taskId, {
          validateCommitment: { expectedVerifier: env.verifier.address }
        });

        await increaseTime(60 * 60 + 15 * 60 + 1);

        await env.buyerSdk.refundAfterProofSubmissionDeadline(created.taskId);
        const task = await env.buyerSdk.getTask(created.taskId);
        expect(task.status).to.equal("REFUNDED");
      });

      it("buyer refunds after verification timeout expires", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        await increaseTime(3600 + 1);

        await env.buyerSdk.refundAfterVerificationTimeout(taskId);
        const task = await env.buyerSdk.getTask(taskId);
        expect(task.status).to.equal("REFUNDED");
      });

      it("BuyerSdk returns EXPIRED status after deadline with no funding", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 1000n;
        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });

        expect(await env.buyerSdk.getTaskStatus(created.taskId)).to.equal("INTENT_CREATED");
        await increaseTime(61);
        expect(await env.buyerSdk.getTaskStatus(created.taskId)).to.equal("EXPIRED");
      });
    });

    describe("A-06: Token and allowance boundary", function () {
      it("fundTask fails when buyer balance is insufficient", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

        // Mint exactly DEFAULT_AMOUNT for stranger — enough for only one task
        await env.mockToken.mint(env.stranger.address, DEFAULT_AMOUNT);
        await env.mockToken.connect(env.stranger).approve(env.settlementAddress, INITIAL_BALANCE);

        const strangerSdk = new BuyerSdk({
          settlementAddress: env.settlementAddress, signer: env.stranger, storage: env.storage
        });

        const created = await strangerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitment = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: env.stranger.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
        await strangerSdk.fundTask(created.taskId, {
          validateCommitment: { expectedVerifier: env.verifier.address }
        });

        // Second task: balance now zero
        const created2 = await strangerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitment2 = buildTestCommitment({
          taskId: created2.taskId as Bytes32,
          buyer: env.stranger.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: created2.taskId as Bytes32, commitment: commitment2 });

        await expect(
          strangerSdk.fundTask(created2.taskId, {
            validateCommitment: { expectedVerifier: env.verifier.address }
          })
        ).to.be.reverted;
      });

      it("fundTask fails when allowance is zero", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitment = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: env.buyer.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });

        await env.mockToken.connect(env.buyer).approve(env.settlementAddress, 0n);

        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
        await expect(contract.connect(env.buyer).fundTask(created.taskId)).to.be.reverted;
      });
    });

    describe("A-07: Concurrent verification race", function () {
      it("second concurrent verify request returns 409 ProofAlreadyConsumedError", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        const [r1, r2] = await Promise.all([
          callVerifier(env.verifierBaseUrl, taskId),
          callVerifier(env.verifierBaseUrl, taskId)
        ]);

        const successCount = [r1, r2].filter((r) => r.status === 200).length;
        const conflictCount = [r1, r2].filter((r) => r.status === 409).length;
        expect(successCount).to.equal(1);
        expect(conflictCount).to.equal(1);

        const fail = r1.status === 409 ? r1 : r2;
        expect((fail.body as { error: string }).error).to.equal("ProofAlreadyConsumedError");
      });
    });

    describe("A-08: Verifier HTTP service basics", function () {
      it("health endpoint returns 200 ok", async function () {
        const res = await fetch(`${env.verifierBaseUrl}/health`);
        expect(res.status).to.equal(200);
        expect(await res.json()).to.deep.equal({ status: "ok" });
      });

      it("missing taskId returns 400", async function () {
        const res = await fetch(`${env.verifierBaseUrl}/verify`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        expect(res.status).to.equal(400);
      });

      it("unknown route returns 404", async function () {
        const res = await fetch(`${env.verifierBaseUrl}/unknown`);
        expect(res.status).to.equal(404);
      });
    });

    describe("A-09: Report hash integrity", function () {
      it("verifier-computed reportHash matches independent recomputation", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        const result = response.body as import("@tyrpay/verifier-service").VerificationResult;

        const recomputedHash = hashVerificationReport({
          schemaVersion: result.report.schemaVersion,
          chainId: result.report.chainId,
          settlementContract: result.report.settlementContract,
          taskId: result.report.taskId, buyer: result.report.buyer,
          seller: result.report.seller,
          commitmentHash: result.report.commitmentHash,
          proofBundleHash: result.report.proofBundleHash,
          passed: result.report.passed, checks: result.report.checks,
          aggregateUsage: result.report.aggregateUsage,
          settlement: result.report.settlement,
          verifier: result.report.verifier,
          verifiedAt: result.report.verifiedAt
        });

        expect(result.report.reportHash).to.equal(recomputedHash);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Part B: Regression guards — bugs that were found and fixed.
  //          These tests document the CORRECT behavior after each fix.
  // ═══════════════════════════════════════════════════════════════════════

  describe("Part B: Regression Guards (Fixed Integration Bugs)", function () {

    // Fix F-01: observedAt was DEFAULT_MOCK_OBSERVED_AT (2025) not EVM time
    describe("[F-01] Happy path through real verifier returns passed=true", function () {
      it("verifier returns passed=true and all checks green on happy path", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        expect(response.status).to.equal(200);

        const result = response.body as import("@tyrpay/verifier-service").VerificationResult;
        expect(result.report.passed, `Expected passed=true. checks=${JSON.stringify(result.checks)}`).to.equal(true);
        expect(result.checks.withinTaskWindow).to.equal(true);
        expect(result.checks.modelMatched).to.equal(true);
        expect(result.checks.usageSatisfied).to.equal(true);
      });

      it("verifier returns passed=true and the report can settle on-chain (RELEASE)", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        const { result } = await verifyAndSettle({ env, taskId });

        expect(result.report.passed).to.equal(true);

        const task = await env.buyerSdk.getTask(taskId);
        expect(task.status).to.equal("SETTLED");
        expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(DEFAULT_AMOUNT);
      });
    });

    // Fix F-02: wrong URI (receipt URI) was passed to submitProofBundle for replay test
    describe("[F-02] Proof bundle replay through verifier returns 409 Conflict", function () {
      it("same proof bundle on two tasks: verifier returns 409 for second task", async function () {
        // Task A: full happy path, mark proofs consumed
        const taskA = await setupTaskToProofSubmitted({ env });
        const responseA = await callVerifier(env.verifierBaseUrl, taskA.taskId, true);
        expect(responseA.status).to.equal(200);

        // Task B: submit the SAME proof bundle hash (using the correct URI)
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const createdB = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitmentB = buildTestCommitment({
          taskId: createdB.taskId as Bytes32,
          buyer: env.buyer.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: createdB.taskId as Bytes32, commitment: commitmentB });
        await env.buyerSdk.fundTask(createdB.taskId, {
          validateCommitment: { expectedVerifier: env.verifier.address }
        });

        // Submit the SAME proofBundleHash with the CORRECT proofBundleURI
        const contract = (await ethers.getContractAt(
          "TyrPaySettlement", env.settlementAddress
        )).connect(env.seller);
        await (await contract.submitProofBundle(
          createdB.taskId,
          taskA.proofBundleHash,
          taskA.proofBundleURI  // correct URI — not a receipt URI
        )).wait();

        const responseB = await callVerifier(env.verifierBaseUrl, createdB.taskId);
        expect(
          responseB.status,
          `Expected 409 for proof replay, got ${responseB.status}: ${JSON.stringify(responseB.body)}`
        ).to.equal(409);
        expect((responseB.body as { error: string }).error).to.equal("ProofAlreadyConsumedError");
      });
    });

    // Fix F-03: verifier clock used Date.now() — now uses EVM block time
    describe("[F-03] Verifier rejects task after EVM verification timeout (non-200)", function () {
      it("calling verifier after timeout returns non-200 (VerifierInvalidTaskStateError → 400)", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        // Advance EVM time past verification timeout (60 min)
        await increaseTime(3600 + 1);

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        expect(
          response.status,
          `Expected non-200 after timeout. Got ${response.status}: ${JSON.stringify(response.body)}`
        ).to.not.equal(200);
      });
    });

    // Fix F-04: sellerFullFlow ignored scenario param
    describe("[F-04] model_mismatch scenario correctly detected by verifier", function () {
      it("model_mismatch proof: verifier returns modelMatched=false", async function () {
        const { taskId } = await setupTaskToProofSubmitted({
          env, scenario: "model_mismatch"
        });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        expect(response.status).to.equal(200);

        const result = response.body as import("@tyrpay/verifier-service").VerificationResult;
        expect(
          result.checks.modelMatched,
          `Expected modelMatched=false but got ${result.checks.modelMatched}`
        ).to.equal(false);
      });

      it("model_mismatch proof: verifier returns passed=false and REFUND action", async function () {
        const { taskId } = await setupTaskToProofSubmitted({
          env, scenario: "model_mismatch"
        });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        const result = response.body as import("@tyrpay/verifier-service").VerificationResult;

        expect(result.report.passed).to.equal(false);
        expect(result.report.settlement.action).to.equal("REFUND");
      });
    });

    // F-05: VerifierInvalidTaskStateError on FUNDED task → HTTP 400 (this IS the correct behavior)
    describe("[F-05] Calling verifier for FUNDED task returns 400 (wrong task state)", function () {
      it("FUNDED task (no proof) → verifier returns 400 VerifierInvalidTaskStateError", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitment = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: env.buyer.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });
        await env.buyerSdk.fundTask(created.taskId, {
          validateCommitment: { expectedVerifier: env.verifier.address }
        });

        const response = await callVerifier(env.verifierBaseUrl, created.taskId);
        // VerifierInvalidTaskStateError → HTTP 400 (correct behavior for wrong state)
        expect(response.status).to.equal(400);
        expect((response.body as { error: string }).error).to.equal("VerifierInvalidTaskStateError");
      });
    });

    // Fix F-06: sellerFullFlow ignored totalTokens; usageSatisfied uses >= (correct)
    describe("[F-06] Usage exactly equal to minUsage satisfies the check (>= boundary)", function () {
      it("totalTokens=100, minUsage=100 → usageSatisfied=true", async function () {
        const { taskId } = await setupTaskToProofSubmitted({
          env,
          totalTokens: 100,
          commitmentMinTokens: 100,
          commitmentOverrides: { minUsage: { totalTokens: 100 } }
        });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        expect(response.status).to.equal(200);
        const result = response.body as import("@tyrpay/verifier-service").VerificationResult;

        expect(
          result.checks.usageSatisfied,
          `totalTokens(100) >= minUsage(100) must satisfy usage, got ${result.checks.usageSatisfied}`
        ).to.equal(true);
        expect(result.report.passed).to.equal(true);
      });
    });

    // F-07: Contract checks EmptyReportHash before signature — this IS the correct check order
    describe("[F-07] Contract checks EmptyReportHash before recovering the signer", function () {
      it("empty reportHash is rejected with EmptyReportHash (not UnauthorizedVerifier)", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        const report = {
          taskId, buyer: env.buyer.address, seller: env.seller.address,
          commitmentHash, proofBundleHash, passed: true,
          settlementAction: 1, settlementAmount: DEFAULT_AMOUNT,
          verifiedAt: BigInt(await env.settlement.currentTimeMs()),
          reportHash: ethers.ZeroHash
        };

        const fakeSignature = await env.stranger.signTypedData(
          { name: "TyrPay", version: "1", chainId: env.chainId, verifyingContract: env.settlementAddress },
          { VerificationReport: [
            { name: "taskId", type: "bytes32" }, { name: "buyer", type: "address" },
            { name: "seller", type: "address" }, { name: "commitmentHash", type: "bytes32" },
            { name: "proofBundleHash", type: "bytes32" }, { name: "passed", type: "bool" },
            { name: "settlementAction", type: "uint8" }, { name: "settlementAmount", type: "uint256" },
            { name: "verifiedAt", type: "uint256" }, { name: "reportHash", type: "bytes32" }
          ] },
          report
        );

        const contract = await ethers.getContractAt("TyrPaySettlement", env.settlementAddress);
        await expect(contract.settle(report, fakeSignature))
          .to.be.revertedWithCustomError(contract, "EmptyReportHash");
      });
    });
  });
});
