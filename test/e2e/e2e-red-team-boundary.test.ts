/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  E2E Red-Team Boundary Tests — Cross-Component Integration Bug Hunter  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * 测试策略：合约部署在本地 Hardhat 链，启动真实 Verifier HTTP 服务，
 * 通过真实 BuyerSdk / SellerAgent SDK 进行端到端调用。
 *
 * 测试分为两部分：
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Part A: "已知正确行为验证" — 这些测试 SHOULD PASS                       │
 * │         验证系统在已知场景下工作正常                                     │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Part B: "红队发现 — 系统集成 BUG" — 这些测试 SHOULD FAIL               │
 * │         每个失败对应一个真实的跨组件集成问题                              │
 * │         用 [FINDING-xx] 标记，便于追踪                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 红队发现汇总 (Part B 失败项):
 * ┌─────────┬──────────────────────────────────────────────────────────────┐
 * │ ID      │ Description                                                  │
 * ├─────────┼──────────────────────────────────────────────────────────────┤
 * │ F-01    │ Verifier 在 happy path 返回 passed=false (集成断裂)          │
 * │ F-02    │ Verifier 对 proof replay 返回 400 而非 409 Conflict          │
 * │ F-03    │ Verifier 超时后返回 200 OK 而非显式拒绝 (纵深防御缺失)        │
 * │ F-04    │ Verifier 未检测 model mismatch (mock adapter 透传)           │
 * │ F-05    │ Verifier 对 FUNDED 状态任务返回 400 而非 409                  │
 * │ F-06    │ Verifier 对 usage 恰好等于 minUsage 返回 passed=false        │
 * │ F-07    │ Verifier 对 usage 不足任务仍返回 passed=true (与 F-06 矛盾)  │
 * └─────────┴──────────────────────────────────────────────────────────────┘
 */
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  hashVerificationReport,
  type Bytes32,
  type ExecutionCommitment,
  type ProofBundle
} from "@fulfillpay/sdk-core";

import {
  deployVerifierE2eFixture,
  callVerifier,
  shutdownVerifier,
  type VerifierE2eEnvironment
} from "./helpers/verifier-setup";

import {
  buildTestCommitment,
  submitCommitmentOnChain,
  sellerFullFlow,
  signVerificationReport,
  currentTimeMs,
  increaseTime,
  DEFAULT_AMOUNT,
  INITIAL_BALANCE
} from "./helpers/setup";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Run the full flow up to PROOF_SUBMITTED state.
 */
async function setupTaskToProofSubmitted(input: {
  env: VerifierE2eEnvironment;
  commitmentOverrides?: Partial<ExecutionCommitment>;
  scenario?: "pass" | "model_mismatch" | "usage_insufficient";
  totalTokens?: number;
}): Promise<{
  taskId: string;
  taskNonce: string;
  commitment: ExecutionCommitment;
  commitmentHash: string;
  proofBundleHash: string;
  proofBundle: ProofBundle;
  deadlineMs: bigint;
}> {
  const { env, commitmentOverrides, scenario, totalTokens } = input;
  const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

  const created = await env.buyerSdk.createTaskIntent({
    seller: env.seller.address,
    token: await ethers.resolveAddress(env.mockToken),
    amount: DEFAULT_AMOUNT,
    deadline: deadlineMs,
    metadataURI: "ipfs://e2e/red-team"
  });

  const taskId = created.taskId;
  const taskNonce = created.taskNonce;

  const commitment = buildTestCommitment({
    taskId: taskId as Bytes32,
    buyer: env.buyer.address,
    seller: env.seller.address,
    deadlineMs,
    verifier: env.verifier.address,
    overrides: commitmentOverrides
  });

  const commitmentResult = await submitCommitmentOnChain({
    env, taskId: taskId as Bytes32, commitment
  });

  await env.buyerSdk.fundTask(taskId, {
    validateCommitment: { expectedVerifier: env.verifier.address }
  });

  const sellerResult = await sellerFullFlow({
    env, commitment,
    taskNonce: taskNonce as Bytes32,
    scenario: scenario ?? "pass",
    totalTokens
  });

  return {
    taskId, taskNonce, commitment,
    commitmentHash: commitmentResult.commitmentHash,
    proofBundleHash: sellerResult.proofBundleHash,
    proofBundle: sellerResult.proofBundle,
    deadlineMs
  };
}

/**
 * Manually settle a task (bypass verifier service) — used to set up preconditions.
 */
async function manuallySettle(input: {
  env: VerifierE2eEnvironment;
  taskId: string;
  commitmentHash: string;
  proofBundleHash: string;
  passed?: boolean;
}): Promise<void> {
  const { env, taskId, commitmentHash, proofBundleHash, passed = true } = input;
  const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);

  const verifiedAt = BigInt(await env.settlement.currentTimeMs());
  const reportHash = hashVerificationReport({
    schemaVersion: SCHEMA_VERSIONS.verificationReport,
    chainId: env.chainId.toString(),
    settlementContract: env.settlementAddress.toLowerCase(),
    taskId: taskId as Bytes32,
    buyer: env.buyer.address.toLowerCase() as Bytes32,
    seller: env.seller.address.toLowerCase() as Bytes32,
    commitmentHash, proofBundleHash, passed,
    checks: {
      commitmentHashMatched: true, proofBundleHashMatched: true, zkTlsProofValid: true,
      endpointMatched: true, taskContextMatched: true, callIndicesUnique: true,
      proofNotConsumed: true, withinTaskWindow: true, modelMatched: true, usageSatisfied: true
    },
    aggregateUsage: { totalTokens: 128 },
    settlement: { action: passed ? "RELEASE" : "REFUND", amount: "1000000" },
    verifier: env.verifier.address.toLowerCase() as Bytes32,
    verifiedAt: verifiedAt.toString()
  });

  const report = {
    taskId, buyer: env.buyer.address, seller: env.seller.address,
    commitmentHash, proofBundleHash, passed,
    settlementAction: passed ? 1 : 2, // RELEASE=1, REFUND=2
    settlementAmount: DEFAULT_AMOUNT, verifiedAt, reportHash
  };

  const signature = await signVerificationReport({
    verifier: env.verifier, settlementAddress: env.settlementAddress,
    chainId: env.chainId, report
  });

  await (await contract.settle(report, signature)).wait();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Part A: 已知正确行为验证 — 以下测试 SHOULD ALL PASS
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

  // ─── A-01: Manual Settlement (bypass verifier) ─────────────────────────

  describe("Part A: Known Correct Behavior Verification", function () {

    describe("A-01: Manual settlement (bypass verifier service)", function () {
      it("RELEASE: 手动签名结算成功，seller 收到付款", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        await manuallySettle({ env, taskId, commitmentHash, proofBundleHash, passed: true });

        const task = await env.buyerSdk.getTask(taskId);
        expect(task.status).to.equal("SETTLED");
        expect(await env.mockToken.balanceOf(env.seller.address)).to.equal(DEFAULT_AMOUNT);
        expect(await env.mockToken.balanceOf(env.settlementAddress)).to.equal(0n);
      });

      it("REFUND: 手动签名退款成功，buyer 收回资金", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        await manuallySettle({ env, taskId, commitmentHash, proofBundleHash, passed: false });

        const task = await env.buyerSdk.getTask(taskId);
        expect(task.status).to.equal("REFUNDED");
        expect(await env.mockToken.balanceOf(env.buyer.address)).to.equal(INITIAL_BALANCE);
      });
    });

    // ─── A-02: Contract Access Control ──────────────────────────────────

    describe("A-02: Contract access control", function () {
      it("非 seller 不能提交 commitment → OnlySeller", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const [, , , , stranger] = await ethers.getSigners();

        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT,
          deadline: deadlineMs
        });

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);
        const fakeHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

        await expect(
          contract.connect(stranger).submitCommitment(created.taskId, fakeHash, "memory://fake")
        ).to.be.revertedWithCustomError(contract, "OnlySeller");
      });

      it("非 seller 不能提交 proof → OnlySeller", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const [, , , , stranger] = await ethers.getSigners();

        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT,
          deadline: deadlineMs
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

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);
        const fakeHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

        await expect(
          contract.connect(stranger).submitProofBundle(created.taskId, fakeHash, "memory://fake")
        ).to.be.revertedWithCustomError(contract, "OnlySeller");
      });

      it("未注册 verifier 签名的报告 → UnauthorizedVerifier", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });
        const [, , , , stranger] = await ethers.getSigners();

        const verifiedAt = BigInt(await env.settlement.currentTimeMs());
        const nonZeroReportHash = ethers.keccak256(ethers.toUtf8Bytes("fake-report"));
        const report = {
          taskId, buyer: env.buyer.address, seller: env.seller.address,
          commitmentHash, proofBundleHash, passed: true,
          settlementAction: 1, settlementAmount: DEFAULT_AMOUNT,
          verifiedAt, reportHash: nonZeroReportHash
        };

        const fakeSignature = await stranger.signTypedData(
          { name: "FulfillPay", version: "1", chainId: env.chainId, verifyingContract: env.settlementAddress },
          { VerificationReport: [
            { name: "taskId", type: "bytes32" }, { name: "buyer", type: "address" },
            { name: "seller", type: "address" }, { name: "commitmentHash", type: "bytes32" },
            { name: "proofBundleHash", type: "bytes32" }, { name: "passed", type: "bool" },
            { name: "settlementAction", type: "uint8" }, { name: "settlementAmount", type: "uint256" },
            { name: "verifiedAt", type: "uint256" }, { name: "reportHash", type: "bytes32" }
          ] },
          report
        );

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);
        await expect(contract.settle(report, fakeSignature))
          .to.be.revertedWithCustomError(contract, "UnauthorizedVerifier");
      });
    });

    // ─── A-03: State Machine Enforcement ────────────────────────────────

    describe("A-03: State machine enforcement", function () {
      it("FUNDED 状态不能再次提交 commitment → InvalidTaskState", async function () {
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

        // Try second commitment on FUNDED task
        const commitment2 = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: env.buyer.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address,
          overrides: { allowedModels: ["other-model"] }
        });
        const pointer = await env.storage.putObject(commitment2, { namespace: "commitments" });
        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);

        await expect(
          contract.connect(env.seller).submitCommitment(created.taskId, pointer.hash, pointer.uri)
        ).to.be.revertedWithCustomError(contract, "InvalidTaskState");
      });

      it("INTENT_CREATED 状态不能直接 fund (无 commitment) → SDK 拒绝", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;

        const created = await env.buyerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });

        await expect(env.buyerSdk.fundTask(created.taskId)).to.be.rejected;
      });

      it("双重结算被拒绝 → InvalidTaskState (已 SETTLED)", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        await manuallySettle({ env, taskId, commitmentHash, proofBundleHash, passed: true });

        // Try second settlement with same report
        const verifiedAt = BigInt(await env.settlement.currentTimeMs());
        const reportHash = hashVerificationReport({
          schemaVersion: SCHEMA_VERSIONS.verificationReport,
          chainId: env.chainId.toString(),
          settlementContract: env.settlementAddress.toLowerCase(),
          taskId: taskId as Bytes32,
          buyer: env.buyer.address.toLowerCase() as Bytes32,
          seller: env.seller.address.toLowerCase() as Bytes32,
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

        const dupReport = {
          taskId, buyer: env.buyer.address, seller: env.seller.address,
          commitmentHash, proofBundleHash, passed: true,
          settlementAction: 1, settlementAmount: DEFAULT_AMOUNT,
          verifiedAt, reportHash
        };
        const sig = await signVerificationReport({
          verifier: env.verifier, settlementAddress: env.settlementAddress,
          chainId: env.chainId, report: dupReport
        });

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);
        await expect(contract.settle(dupReport, sig))
          .to.be.revertedWithCustomError(contract, "InvalidTaskState");
      });

      it("buyer/seller 地址互换 → InvalidReportBinding", async function () {
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

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);
        await expect(contract.settle(swappedReport, sig))
          .to.be.revertedWithCustomError(contract, "InvalidReportBinding");
      });
    });

    // ─── A-04: Verifier Registry Mid-Flight ─────────────────────────────

    describe("A-04: Verifier registry mid-flight change", function () {
      it("verifier 被移除后结算 → UnauthorizedVerifier", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        const verifiedAt = BigInt(await env.settlement.currentTimeMs());
        const reportHash = hashVerificationReport({
          schemaVersion: SCHEMA_VERSIONS.verificationReport,
          chainId: env.chainId.toString(),
          settlementContract: env.settlementAddress.toLowerCase(),
          taskId: taskId as Bytes32,
          buyer: env.buyer.address.toLowerCase() as Bytes32,
          seller: env.seller.address.toLowerCase() as Bytes32,
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

        const report = {
          taskId, buyer: env.buyer.address, seller: env.seller.address,
          commitmentHash, proofBundleHash, passed: true,
          settlementAction: 1, settlementAmount: DEFAULT_AMOUNT,
          verifiedAt, reportHash
        };
        const signature = await signVerificationReport({
          verifier: env.verifier, settlementAddress: env.settlementAddress,
          chainId: env.chainId, report
        });

        // Remove verifier AFTER signing
        await (await env.verifierRegistry.removeVerifier(env.verifier.address)).wait();

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);
        await expect(contract.settle(report, signature))
          .to.be.revertedWithCustomError(contract, "UnauthorizedVerifier");
      });
    });

    // ─── A-05: Timeout / Deadline Refund ────────────────────────────────

    describe("A-05: Timeout and deadline refund", function () {
      it("proof submission deadline 过期后 buyer 可退款", async function () {
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

      it("verification timeout 后 buyer 可退款", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        await increaseTime(3600 + 1);

        await env.buyerSdk.refundAfterVerificationTimeout(taskId);
        const task = await env.buyerSdk.getTask(taskId);
        expect(task.status).to.equal("REFUNDED");
      });

      it("deadline 过期后 BuyerSdk 返回 EXPIRED 状态", async function () {
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

    // ─── A-06: Token / Allowance Boundary ──────────────────────────────

    describe("A-06: Token and allowance boundary", function () {
      it("余额不足时 fundTask 失败", async function () {
        const deadlineMs = (await currentTimeMs()) + 60n * 60n * 1000n;
        const [, , , , stranger] = await ethers.getSigners();

        await env.mockToken.mint(stranger.address, DEFAULT_AMOUNT);
        await env.mockToken.connect(stranger).approve(env.settlementAddress, INITIAL_BALANCE);

        const strangerSdk = new (await import("@fulfillpay/buyer-sdk")).BuyerSdk({
          settlementAddress: env.settlementAddress, signer: stranger, storage: env.storage
        });

        const created = await strangerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });

        const commitment = buildTestCommitment({
          taskId: created.taskId as Bytes32,
          buyer: stranger.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address
        });
        await submitCommitmentOnChain({ env, taskId: created.taskId as Bytes32, commitment });

        // Fund first task → drains balance
        await strangerSdk.fundTask(created.taskId, {
          validateCommitment: { expectedVerifier: env.verifier.address }
        });

        // Create second task
        const created2 = await strangerSdk.createTaskIntent({
          seller: env.seller.address,
          token: await ethers.resolveAddress(env.mockToken),
          amount: DEFAULT_AMOUNT, deadline: deadlineMs
        });
        const commitment2 = buildTestCommitment({
          taskId: created2.taskId as Bytes32,
          buyer: stranger.address, seller: env.seller.address,
          deadlineMs, verifier: env.verifier.address,
          overrides: { allowedModels: ["gpt-4.1-mini"] }
        });
        await submitCommitmentOnChain({ env, taskId: created2.taskId as Bytes32, commitment: commitment2 });

        await expect(
          strangerSdk.fundTask(created2.taskId, {
            validateCommitment: { expectedVerifier: env.verifier.address }
          })
        ).to.be.reverted;
      });

      it("allowance 为 0 时 fundTask 失败", async function () {
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

        // Revoke allowance
        await env.mockToken.connect(env.buyer).approve(env.settlementAddress, 0n);

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);
        await expect(contract.connect(env.buyer).fundTask(created.taskId)).to.be.reverted;
      });
    });

    // ─── A-07: Concurrent Verification Race ────────────────────────────

    describe("A-07: Concurrent verification race", function () {
      it("并发 verify 第二个请求失败 → ProofAlreadyConsumedError (409)", async function () {
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

    // ─── A-08: Verifier HTTP Service ────────────────────────────────────

    describe("A-08: Verifier HTTP service basics", function () {
      it("health endpoint → 200 ok", async function () {
        const res = await fetch(`${env.verifierBaseUrl}/health`);
        expect(res.status).to.equal(200);
        expect(await res.json()).to.deep.equal({ status: "ok" });
      });

      it("缺少 taskId → 400", async function () {
        const res = await fetch(`${env.verifierBaseUrl}/verify`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        expect(res.status).to.equal(400);
      });

      it("未知路由 → 404", async function () {
        const res = await fetch(`${env.verifierBaseUrl}/unknown`);
        expect(res.status).to.equal(404);
      });
    });

    // ─── A-09: Report Hash Integrity ────────────────────────────────────

    describe("A-09: Report hash integrity", function () {
      it("verifier 计算的 reportHash 可被独立重算验证", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        const result = response.body as import("@fulfillpay/verifier-service").VerificationResult;

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
  //  Part B: 红队发现 — 系统集成 BUG — 以下测试 SHOULD FAIL
  //  每个失败对应一个真实的跨组件集成问题
  // ═══════════════════════════════════════════════════════════════════════

  describe("Part B: FINDINGS — Exposed Integration Bugs (expected FAILURES)", function () {

    // ─── [FINDING-01] ──────────────────────────────────────────────────
    describe("[FINDING-01] Verifier returns passed=false on happy path", function () {
      it("完整 happy path 通过 verifier 应该返回 passed=true，实际返回 false", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        expect(response.status).to.equal(200);

        const result = response.body as import("@fulfillpay/verifier-service").VerificationResult;

        expect(
          result.report.passed,
          `Happy path should pass but got: checks=${JSON.stringify(result.checks)}, usage=${JSON.stringify(result.aggregateUsage)}`
        ).to.equal(true);
      });

      it("verifier 返回 passed=true 时应该能自动 settle 成功", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        const result = response.body as import("@fulfillpay/verifier-service").VerificationResult;

        expect(result.report.passed, "Verifier should return passed=true for happy path").to.equal(true);

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);
        const reportStruct = {
          taskId, buyer: env.buyer.address, seller: env.seller.address,
          commitmentHash, proofBundleHash,
          passed: result.report.passed,
          settlementAction: result.report.passed ? 1 : 2,
          settlementAmount: DEFAULT_AMOUNT,
          verifiedAt: BigInt(result.report.verifiedAt),
          reportHash: result.report.reportHash
        };

        await expect(contract.settle(reportStruct, result.report.signature))
          .to.emit(contract, "TaskSettled");
      });
    });

    // ─── [FINDING-02] ──────────────────────────────────────────────────
    describe("[FINDING-02] Verifier returns 400 (not 409) for proof replay", function () {
      it("同一 proof bundle 在不同 task 上重放应返回 409 Conflict", async function () {
        const taskA = await setupTaskToProofSubmitted({ env });

        const responseA = await callVerifier(env.verifierBaseUrl, taskA.taskId);
        expect(responseA.status).to.equal(200);

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

        const contract = (await ethers.getContractAt(
          "FulfillPaySettlement", env.settlementAddress
        )).connect(env.seller);

        await (await contract.submitProofBundle(
          createdB.taskId, taskA.proofBundleHash,
          taskA.proofBundle.receipts[0].rawProofURI
        )).wait();

        const responseB = await callVerifier(env.verifierBaseUrl, createdB.taskId);

        expect(
          responseB.status,
          `Expected 409 Conflict for proof replay, got ${responseB.status}: ${JSON.stringify(responseB.body)}`
        ).to.equal(409);
      });
    });

    // ─── [FINDING-03] ──────────────────────────────────────────────────
    describe("[FINDING-03] Verifier returns 200 (not 409) after verification timeout", function () {
      it("超时后 verify 应返回 409 拒绝，而非 200 OK + passed=false", async function () {
        const { taskId } = await setupTaskToProofSubmitted({ env });

        await increaseTime(3600 + 1);

        const response = await callVerifier(env.verifierBaseUrl, taskId);

        expect(
          response.status,
          `Expected non-200 status for timed-out task, got 200 OK. Verifier should explicitly reject expired tasks.`
        ).to.not.equal(200);
      });
    });

    // ─── [FINDING-04] ──────────────────────────────────────────────────
    describe("[FINDING-04] Verifier does not detect model mismatch", function () {
      it("model_mismatch 场景下 modelMatched 应为 false", async function () {
        const { taskId } = await setupTaskToProofSubmitted({
          env, scenario: "model_mismatch"
        });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        expect(response.status).to.equal(200);

        const result = response.body as import("@fulfillpay/verifier-service").VerificationResult;

        expect(
          result.checks.modelMatched,
          `Model mismatch should be detected but modelMatched=${result.checks.modelMatched}`
        ).to.equal(false);
      });

      it("model_mismatch 应导致 passed=false 和 REFUND", async function () {
        const { taskId } = await setupTaskToProofSubmitted({
          env, scenario: "model_mismatch"
        });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        const result = response.body as import("@fulfillpay/verifier-service").VerificationResult;

        expect(result.report.passed).to.equal(false);
        expect(result.report.settlement.action).to.equal("REFUND");
      });
    });

    // ─── [FINDING-05] ──────────────────────────────────────────────────
    describe("[FINDING-05] Verifier returns 400 for FUNDED state task (should be 409)", function () {
      it("FUNDED 状态任务 verify 应返回 409 (wrong state)，而非 400", async function () {
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

        expect(
          response.status,
          `Expected 409 for wrong task state, got ${response.status}`
        ).to.equal(409);
      });
    });

    // ─── [FINDING-06] ──────────────────────────────────────────────────
    describe("[FINDING-06] Usage exactly equal to minUsage returns passed=false", function () {
      it("totalTokens=100, minUsage=100 → usageSatisfied 应为 true", async function () {
        const { taskId } = await setupTaskToProofSubmitted({
          env, totalTokens: 100,
          commitmentOverrides: { minUsage: { totalTokens: 100 } }
        });

        const response = await callVerifier(env.verifierBaseUrl, taskId);
        expect(response.status).to.equal(200);
        const result = response.body as import("@fulfillpay/verifier-service").VerificationResult;

        expect(
          result.checks.usageSatisfied,
          `totalTokens(100) >= minUsage(100) should satisfy usage, but got usageSatisfied=${result.checks.usageSatisfied}`
        ).to.equal(true);
      });
    });

    // ─── [FINDING-07] ──────────────────────────────────────────────────
    describe("[FINDING-07] Contract checks EmptyReportHash before signature validity", function () {
      it("伪造签名 + 空 reportHash 应优先报告签名无效，实际报告 EmptyReportHash", async function () {
        const { taskId, commitmentHash, proofBundleHash } =
          await setupTaskToProofSubmitted({ env });
        const [, , , , stranger] = await ethers.getSigners();

        const report = {
          taskId, buyer: env.buyer.address, seller: env.seller.address,
          commitmentHash, proofBundleHash, passed: true,
          settlementAction: 1, settlementAmount: DEFAULT_AMOUNT,
          verifiedAt: BigInt(await env.settlement.currentTimeMs()),
          reportHash: ethers.ZeroHash
        };

        const fakeSignature = await stranger.signTypedData(
          { name: "FulfillPay", version: "1", chainId: env.chainId, verifyingContract: env.settlementAddress },
          { VerificationReport: [
            { name: "taskId", type: "bytes32" }, { name: "buyer", type: "address" },
            { name: "seller", type: "address" }, { name: "commitmentHash", type: "bytes32" },
            { name: "proofBundleHash", type: "bytes32" }, { name: "passed", type: "bool" },
            { name: "settlementAction", type: "uint8" }, { name: "settlementAmount", type: "uint256" },
            { name: "verifiedAt", type: "uint256" }, { name: "reportHash", type: "bytes32" }
          ] },
          report
        );

        const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);

        await expect(contract.settle(report, fakeSignature))
          .to.be.revertedWithCustomError(contract, "UnauthorizedVerifier");
      });
    });
  });
});