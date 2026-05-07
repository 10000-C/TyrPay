import assert from "node:assert/strict";
import { type Server } from "node:http";
import path from "node:path";

import * as dotenv from "dotenv";
import { JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";

import {
  SCHEMA_VERSIONS,
  buildCallIntentHash,
  hashExecutionCommitment,
  hashObject,
  normalizeAddress,
  type Address,
  type Bytes32,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type VerificationReport
} from "@fulfillpay/sdk-core";
import { BuyerSdk } from "@fulfillpay/buyer-sdk";
import { SellerAgent } from "@fulfillpay/seller-sdk";
import { MemoryStorageAdapter } from "@fulfillpay/storage-adapter";
import {
  CentralizedVerifier,
  EthersSettlementTaskReader,
  InMemoryProofConsumptionRegistry,
  createVerifierHttpServer,
  toSettlementReportStruct
} from "@fulfillpay/verifier-service";
import { MockZkTlsAdapter, type MockScenario, type MockTimeWindow } from "@fulfillpay/zktls-adapter";

import {
  FulfillPaySettlement,
  FulfillPaySettlement__factory,
  MockERC20,
  MockERC20__factory,
  VerifierRegistry,
  VerifierRegistry__factory
} from "../typechain-types";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const DEFAULT_AMOUNT = 1_000_000n;
const INITIAL_BALANCE = 50_000_000n;
const PROOF_SUBMISSION_GRACE_PERIOD_MS = 10_000n;
const VERIFICATION_TIMEOUT_MS = 10_000n;
const SHORT_DEADLINE_OFFSET_MS = 45_000n;

const ERROR_SELECTORS = {
  InvalidTaskState: "0x42b62a57",
  ProofBundleAlreadyUsed: "0x1e16b89a",
  UnauthorizedVerifier: "0xb9857aa1",
  TaskExpired: "0xc0343103"
} as const;

type SigningWallet = {
  address: string;
  signTypedData: Wallet["signTypedData"];
};

async function main() {
  const env = await deployLiveBoundaryEnvironment();
  const results: Array<{ name: string; details?: string }> = [];

  try {
    await runCase(results, "Happy path release", () => caseHappyPathRelease(env));
    await runCase(results, "Model mismatch refund", () => caseModelMismatchRefund(env));
    await runCase(results, "Usage insufficient refund", () => caseUsageInsufficientRefund(env));
    await runCase(results, "Late proof within grace settles", () => caseLateProofWithinGrace(env));
    await runCase(results, "Observed before funded refunds", () => caseObservedBeforeFundedRefund(env));
    await runCase(results, "Refund after proof deadline", () => caseRefundAfterProofSubmissionDeadline(env));
    await runCase(results, "Refund after verification timeout", () => caseRefundAfterVerificationTimeout(env));
    await runCase(results, "Derived EXPIRED status", () => caseDerivedExpired(env));
    await runCase(results, "Replay protection rejects reused proof bundle", () => caseReplayProtection(env));
    await runCase(results, "Invalid verifier signature rejected", () => caseInvalidVerifierSignature(env));
    await runCase(results, "Wrong chainId domain rejected", () => caseWrongChainIdDomain(env));
    await runCase(results, "Wrong verifyingContract domain rejected", () => caseWrongVerifyingContractDomain(env));
    await runCase(results, "Buyer commitment host validation", () => caseBuyerCommitmentHostValidation(env));
    await runCase(results, "Reject INTENT_CREATED -> FUNDED", () => caseRejectIntentToFunded(env));
    await runCase(results, "Reject INTENT_CREATED -> PROOF_SUBMITTED", () => caseRejectIntentToProofSubmitted(env));
    await runCase(results, "Reject COMMITMENT_SUBMITTED -> PROOF_SUBMITTED", () => caseRejectCommitmentToProofSubmitted(env));
    await runCase(results, "Reject FUNDED -> SETTLED", () => caseRejectFundedToSettled(env));
    await runCase(results, "Reject terminal transitions after SETTLED", () => caseRejectTerminalTransitionsAfterSettled(env));
    await runCase(results, "Reject terminal transitions after REFUNDED", () => caseRejectTerminalTransitionsAfterRefunded(env));

    console.log(`Real-network boundary suite passed on chain ${env.chainId.toString()}.`);
    console.log(`Verifier service: local ephemeral HTTP server backed by CentralizedVerifier`);
    console.log(`VerifierRegistry: ${await env.verifierRegistry.getAddress()}`);
    console.log(`Settlement: ${await env.settlement.getAddress()}`);
    console.log(`MockToken: ${await env.mockToken.getAddress()}`);
    for (const result of results) {
      console.log(`- ${result.name}${result.details ? `: ${result.details}` : ""}`);
    }
  } finally {
    await closeServer(env.verifierServer);
  }
}

interface LiveBoundaryEnvironment {
  provider: JsonRpcProvider;
  chainId: bigint;
  ownerWallet: Wallet;
  buyerWallet: Wallet;
  sellerWallet: Wallet;
  verifierWallet: Wallet;
  strangerWallet: SigningWallet;
  verifierRegistry: VerifierRegistry;
  settlement: FulfillPaySettlement;
  mockToken: MockERC20;
  storage: MemoryStorageAdapter;
  zkTlsAdapter: MockZkTlsAdapter;
  buyerSdk: BuyerSdk;
  sellerAgent: SellerAgent;
  verifierService: CentralizedVerifier;
  verifierServer: Server;
  verifierBaseUrl: string;
}

async function deployLiveBoundaryEnvironment(): Promise<LiveBoundaryEnvironment> {
  const rpcUrl = requireEnv("ZERO_G_EVM_RPC");
  const provider = new JsonRpcProvider(rpcUrl);

  const ownerWallet = new Wallet(normalizePrivateKey(requireEnv("CONTRACT_OWNER_PRIVATE_KEY")), provider);
  const buyerWallet = new Wallet(normalizePrivateKey(requireEnv("BUYER_PRIVATE_KEY")), provider);
  const sellerWallet = new Wallet(normalizePrivateKey(requireEnv("SELLER_PRIVATE_KEY")), provider);
  const verifierWallet = new Wallet(normalizePrivateKey(requireEnv("VERIFIER_PRIVATE_KEY")), provider);
  const strangerWallet = Wallet.createRandom().connect(provider);

  const network = await provider.getNetwork();
  const envChainId = process.env.CHAIN_ID?.trim();
  if (envChainId && BigInt(envChainId) !== network.chainId) {
    throw new Error(`CHAIN_ID=${envChainId} does not match provider chainId=${network.chainId.toString()}.`);
  }

  const verifierRegistry = await new VerifierRegistry__factory(ownerWallet).deploy(ownerWallet.address);
  await verifierRegistry.waitForDeployment();
  await (await verifierRegistry.addVerifier(verifierWallet.address)).wait();

  const settlement = await new FulfillPaySettlement__factory(ownerWallet).deploy(
    await verifierRegistry.getAddress(),
    PROOF_SUBMISSION_GRACE_PERIOD_MS,
    VERIFICATION_TIMEOUT_MS
  );
  await settlement.waitForDeployment();

  const mockToken = await new MockERC20__factory(ownerWallet).deploy(
    "FulfillPay Boundary Mock USD",
    "fpBUSD",
    ownerWallet.address,
    0n
  );
  await mockToken.waitForDeployment();

  await (await settlement.setAllowedToken(await mockToken.getAddress(), true)).wait();
  await (await mockToken.mint(buyerWallet.address, INITIAL_BALANCE)).wait();
  await (await mockToken.connect(buyerWallet).approve(await settlement.getAddress(), INITIAL_BALANCE)).wait();

  const storage = new MemoryStorageAdapter();
  const zkTlsAdapter = new MockZkTlsAdapter();

  const buyerSdk = new BuyerSdk({
    settlementAddress: await settlement.getAddress(),
    signer: buyerWallet as unknown as ConstructorParameters<typeof BuyerSdk>[0]["signer"],
    storage
  });

  const sellerAgent = new SellerAgent({
    signer: sellerWallet as unknown as import("@fulfillpay/seller-sdk").Signer,
    settlementContract: await settlement.getAddress() as Address,
    chainId: network.chainId.toString(),
    storageAdapter: storage,
    zkTlsAdapter
  });

  const verifierService = new CentralizedVerifier({
    settlement: new EthersSettlementTaskReader({
      settlementAddress: await settlement.getAddress(),
      runner: verifierWallet as unknown as ConstructorParameters<typeof EthersSettlementTaskReader>[0]["runner"],
      chainId: network.chainId
    }),
    storage,
    signer: verifierWallet as unknown as import("@fulfillpay/verifier-service").VerificationReportSigner,
    zktlsAdapters: [zkTlsAdapter],
    consumptionRegistry: new InMemoryProofConsumptionRegistry(),
    clock: async () => {
      const block = await provider.getBlock("latest");
      if (!block) {
        throw new Error("Latest block is unavailable.");
      }

      return BigInt(block.timestamp) * 1000n;
    }
  });

  const verifierServer = createVerifierHttpServer({ verifier: verifierService });
  const verifierBaseUrl = await listenOnEphemeralPort(verifierServer);

  return {
    provider,
    chainId: network.chainId,
    ownerWallet,
    buyerWallet,
    sellerWallet,
    verifierWallet,
    strangerWallet,
    verifierRegistry,
    settlement,
    mockToken,
    storage,
    zkTlsAdapter,
    buyerSdk,
    sellerAgent,
    verifierService,
    verifierServer,
    verifierBaseUrl
  };
}

async function caseHappyPathRelease(env: LiveBoundaryEnvironment) {
  const { taskId, commitment, commitmentHash, proof } = await createProofSubmittedTask(env, {
    amount: DEFAULT_AMOUNT,
    minTokens: 100
  });

  const verificationResult = await verifyAndSettle(env, taskId);
  assert.equal(verificationResult.report.passed, true);
  assert.equal(verificationResult.report.settlement.action, "RELEASE");
  assert.equal(verificationResult.checks.withinTaskWindow, true);
  assert.equal(verificationResult.checks.modelMatched, true);
  assert.equal(verificationResult.checks.usageSatisfied, true);

  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "SETTLED");
  assert.equal(task.commitmentHash, commitmentHash);
  assert.equal(task.proofBundleHash, proof.proofBundleHash);
  assert.equal(commitment.taskId, taskId);
}

async function caseModelMismatchRefund(env: LiveBoundaryEnvironment) {
  const { taskId } = await createProofSubmittedTask(env, {
    amount: 110_000n,
    scenario: "model_mismatch"
  });
  const verificationResult = await verifyAndSettle(env, taskId);
  assert.equal(verificationResult.report.passed, false);
  assert.equal(verificationResult.report.settlement.action, "REFUND");
  assert.equal(verificationResult.checks.modelMatched, false);
  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "REFUNDED");
}

async function caseUsageInsufficientRefund(env: LiveBoundaryEnvironment) {
  const { taskId } = await createProofSubmittedTask(env, {
    amount: 120_000n,
    minTokens: 500,
    scenario: "usage_insufficient",
    commitmentMinTokens: 500
  });
  const verificationResult = await verifyAndSettle(env, taskId);
  assert.equal(verificationResult.report.passed, false);
  assert.equal(verificationResult.checks.usageSatisfied, false);
  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "REFUNDED");
}

async function caseLateProofWithinGrace(env: LiveBoundaryEnvironment) {
  const { taskId, taskNonce, commitment, deadlineMs } = await createCommittedFundedTask(env, {
    amount: 130_000n,
    deadlineOffsetMs: SHORT_DEADLINE_OFFSET_MS
  });

  const builtProof = await buildUploadedProof(env, {
    commitment,
    taskNonce,
    observedAt: await env.settlement.currentTimeMs()
  });

  await waitUntilOnChainMs(env.settlement, deadlineMs + 1_000n);

  await env.sellerAgent.submitProofBundleHash(
    env.settlement.connect(env.sellerWallet) as unknown as import("@fulfillpay/seller-sdk").ContractLike,
    taskId as Bytes32,
    builtProof.proofBundleHash,
    builtProof.proofBundleURI
  );

  const verificationResult = await verifyAndSettle(env, taskId);
  assert.equal(verificationResult.report.passed, true);
  assert.equal(verificationResult.checks.withinTaskWindow, true);
  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "SETTLED");
}

async function caseObservedBeforeFundedRefund(env: LiveBoundaryEnvironment) {
  const { taskId } = await createProofSubmittedTask(env, {
    amount: 140_000n,
    scenario: "timestamp_before_funded"
  });
  const verificationResult = await verifyAndSettle(env, taskId);
  assert.equal(verificationResult.report.passed, false);
  assert.equal(verificationResult.checks.withinTaskWindow, false);
  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "REFUNDED");
}

async function caseRefundAfterProofSubmissionDeadline(env: LiveBoundaryEnvironment) {
  const { taskId, deadlineMs } = await createCommittedFundedTask(env, {
    amount: 150_000n,
    deadlineOffsetMs: SHORT_DEADLINE_OFFSET_MS
  });
  await waitUntilOnChainMs(env.settlement, deadlineMs + PROOF_SUBMISSION_GRACE_PERIOD_MS + 1_000n);
  await (await env.settlement.connect(env.buyerWallet).refundAfterProofSubmissionDeadline(taskId)).wait();
  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "REFUNDED");
}

async function caseRefundAfterVerificationTimeout(env: LiveBoundaryEnvironment) {
  const { taskId, proofSubmittedAt } = await createProofSubmittedTask(env, {
    amount: 160_000n
  });
  await waitUntilOnChainMs(env.settlement, proofSubmittedAt + VERIFICATION_TIMEOUT_MS + 1_000n);
  await (await env.settlement.connect(env.buyerWallet).refundAfterVerificationTimeout(taskId)).wait();
  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "REFUNDED");
}

async function caseDerivedExpired(env: LiveBoundaryEnvironment) {
  const { taskId, deadlineMs } = await createCommittedTask(env, {
    amount: 170_000n,
    deadlineOffsetMs: SHORT_DEADLINE_OFFSET_MS
  });
  await waitUntilOnChainMs(env.settlement, deadlineMs + 1_000n);
  assert.equal(await env.buyerSdk.getTaskStatus(taskId), "EXPIRED");
  const task = await env.settlement.getTask(taskId);
  assert.equal(task.status, 1n);
}

async function caseReplayProtection(env: LiveBoundaryEnvironment) {
  const first = await createProofSubmittedTask(env, {
    amount: 180_000n
  });
  const firstVerification = await verifyAndSettle(env, first.taskId);
  assert.equal(firstVerification.report.passed, true);

  const second = await createCommittedFundedTask(env, {
    amount: 181_000n
  });
  await (
    await env.settlement.connect(env.sellerWallet).submitProofBundle(
      second.taskId,
      first.proof.proofBundleHash,
      first.proof.proofBundleURI
    )
  ).wait();

  const task = await env.buyerSdk.getTask(second.taskId);
  const report = await buildSignedSettlementReport(env, {
    taskId: second.taskId as Bytes32,
    buyer: env.buyerWallet.address,
    seller: env.sellerWallet.address,
    commitmentHash: task.commitmentHash!,
    proofBundleHash: first.proof.proofBundleHash,
    passed: false,
    settlementAction: 2,
    settlementAmount: 181_000n,
    reportHashSeed: "replay-protection"
  });

  await assert.rejects(
    async () => {
      await (await env.settlement.connect(env.buyerWallet).settle(report.report, report.signature)).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.ProofBundleAlreadyUsed)
  );
}

async function caseInvalidVerifierSignature(env: LiveBoundaryEnvironment) {
  const { taskId, commitmentHash, proof } = await createProofSubmittedTask(env, {
    amount: 190_000n
  });
  const report = await buildSignedSettlementReport(env, {
    taskId: taskId as Bytes32,
    buyer: env.buyerWallet.address,
    seller: env.sellerWallet.address,
    commitmentHash,
    proofBundleHash: proof.proofBundleHash,
    passed: true,
    settlementAction: 1,
    settlementAmount: 190_000n,
    signer: env.strangerWallet,
    reportHashSeed: "bad-verifier"
  });
  await assert.rejects(
    async () => {
      await (await env.settlement.connect(env.buyerWallet).settle(report.report, report.signature)).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.UnauthorizedVerifier)
  );
}

async function caseWrongChainIdDomain(env: LiveBoundaryEnvironment) {
  const { taskId, commitmentHash, proof } = await createProofSubmittedTask(env, {
    amount: 191_000n
  });
  const report = await buildSignedSettlementReport(env, {
    taskId: taskId as Bytes32,
    buyer: env.buyerWallet.address,
    seller: env.sellerWallet.address,
    commitmentHash,
    proofBundleHash: proof.proofBundleHash,
    passed: true,
    settlementAction: 1,
    settlementAmount: 191_000n,
    chainId: env.chainId + 999n,
    reportHashSeed: "wrong-chain-id"
  });
  await assert.rejects(
    async () => {
      await (await env.settlement.connect(env.buyerWallet).settle(report.report, report.signature)).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.UnauthorizedVerifier)
  );
}

async function caseWrongVerifyingContractDomain(env: LiveBoundaryEnvironment) {
  const { taskId, commitmentHash, proof } = await createProofSubmittedTask(env, {
    amount: 192_000n
  });
  const report = await buildSignedSettlementReport(env, {
    taskId: taskId as Bytes32,
    buyer: env.buyerWallet.address,
    seller: env.sellerWallet.address,
    commitmentHash,
    proofBundleHash: proof.proofBundleHash,
    passed: false,
    settlementAction: 2,
    settlementAmount: 192_000n,
    verifyingContract: Wallet.createRandom().address,
    reportHashSeed: "wrong-verifying-contract"
  });
  await assert.rejects(
    async () => {
      await (await env.settlement.connect(env.buyerWallet).settle(report.report, report.signature)).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.UnauthorizedVerifier)
  );
}

async function caseBuyerCommitmentHostValidation(env: LiveBoundaryEnvironment) {
  const { taskId } = await createCommittedTask(env, {
    amount: 193_000n,
    commitmentOverrides: {
      target: {
        host: "evil.example.com",
        path: "/v1/chat/completions",
        method: "POST"
      }
    }
  });

  await assert.rejects(
    () =>
      env.buyerSdk.fundTask(taskId, {
        validateCommitment: {
          acceptedHosts: ["api.openai.com"],
          acceptedModels: ["gpt-4.1-mini"],
          expectedVerifier: env.verifierWallet.address
        }
      }),
    /accepted by the buyer/
  );

  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "COMMITMENT_SUBMITTED");
}

async function caseRejectIntentToFunded(env: LiveBoundaryEnvironment) {
  const deadlineMs = await defaultDeadlineMs(env.settlement);
  const created = await env.buyerSdk.createTaskIntent({
    seller: env.sellerWallet.address,
    token: await env.mockToken.getAddress(),
    amount: 194_000n,
    deadline: deadlineMs
  });
  await assert.rejects(
    async () => {
      await (await env.settlement.connect(env.buyerWallet).fundTask(created.taskId)).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.InvalidTaskState)
  );
}

async function caseRejectIntentToProofSubmitted(env: LiveBoundaryEnvironment) {
  const deadlineMs = await defaultDeadlineMs(env.settlement);
  const created = await env.buyerSdk.createTaskIntent({
    seller: env.sellerWallet.address,
    token: await env.mockToken.getAddress(),
    amount: 195_000n,
    deadline: deadlineMs
  });
  await assert.rejects(
    async () => {
      await (
        await env.settlement.connect(env.sellerWallet).submitProofBundle(
          created.taskId,
          bytes32FromSeed("intent-proof"),
          "memory://proof-bundles/intent-proof"
        )
      ).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.InvalidTaskState)
  );
}

async function caseRejectCommitmentToProofSubmitted(env: LiveBoundaryEnvironment) {
  const { taskId } = await createCommittedTask(env, {
    amount: 196_000n
  });
  await assert.rejects(
    async () => {
      await (
        await env.settlement.connect(env.sellerWallet).submitProofBundle(
          taskId,
          bytes32FromSeed("commitment-proof"),
          "memory://proof-bundles/commitment-proof"
        )
      ).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.InvalidTaskState)
  );
}

async function caseRejectFundedToSettled(env: LiveBoundaryEnvironment) {
  const funded = await createCommittedFundedTask(env, {
    amount: 197_000n
  });
  const commitmentHash = hashExecutionCommitment(funded.commitment);
  const report = await buildSignedSettlementReport(env, {
    taskId: funded.taskId as Bytes32,
    buyer: env.buyerWallet.address,
    seller: env.sellerWallet.address,
    commitmentHash,
    proofBundleHash: bytes32FromSeed("funded-to-settled-proof"),
    passed: true,
    settlementAction: 1,
    settlementAmount: 197_000n,
    reportHashSeed: "funded-to-settled"
  });
  await assert.rejects(
    async () => {
      await (await env.settlement.connect(env.buyerWallet).settle(report.report, report.signature)).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.InvalidTaskState)
  );
}

async function caseRejectTerminalTransitionsAfterSettled(env: LiveBoundaryEnvironment) {
  const { taskId } = await createProofSubmittedTask(env, {
    amount: 198_000n
  });
  await verifyAndSettle(env, taskId);
  await assert.rejects(
    async () => {
      await (await env.settlement.connect(env.buyerWallet).refundAfterVerificationTimeout(taskId)).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.InvalidTaskState)
  );
}

async function caseRejectTerminalTransitionsAfterRefunded(env: LiveBoundaryEnvironment) {
  const { taskId } = await createProofSubmittedTask(env, {
    amount: 199_000n,
    scenario: "model_mismatch"
  });
  await verifyAndSettle(env, taskId);
  const task = await env.buyerSdk.getTask(taskId);
  assert.equal(task.status, "REFUNDED");
  await assert.rejects(
    async () => {
      await (await env.settlement.connect(env.buyerWallet).refundAfterVerificationTimeout(taskId)).wait();
    },
    (error) => hasCustomErrorSelector(error, ERROR_SELECTORS.InvalidTaskState)
  );
}

async function createCommittedTask(
  env: LiveBoundaryEnvironment,
  options: {
    amount: bigint;
    deadlineOffsetMs?: bigint;
    minTokens?: number;
    commitmentOverrides?: Partial<ExecutionCommitment>;
  }
) {
  const deadlineMs = await defaultDeadlineMs(env.settlement, options.deadlineOffsetMs);
  const created = await env.buyerSdk.createTaskIntent({
    seller: env.sellerWallet.address,
    token: await env.mockToken.getAddress(),
    amount: options.amount,
    deadline: deadlineMs
  });

  const commitment = buildCommitment({
    taskId: created.taskId as Bytes32,
    buyer: env.buyerWallet.address,
    seller: env.sellerWallet.address,
    deadlineMs,
    verifier: env.verifierWallet.address,
    minTokens: options.minTokens,
    overrides: options.commitmentOverrides
  });

  const pointer = await env.storage.putObject(commitment, { namespace: "commitments" });
  await env.sellerAgent.submitCommitment(
    env.settlement.connect(env.sellerWallet) as unknown as import("@fulfillpay/seller-sdk").ContractLike,
    commitment,
    pointer.uri
  );

  return {
    taskId: created.taskId,
    taskNonce: created.taskNonce as Bytes32,
    commitment,
    commitmentHash: pointer.hash as Bytes32,
    deadlineMs
  };
}

async function createCommittedFundedTask(
  env: LiveBoundaryEnvironment,
  options: {
    amount: bigint;
    deadlineOffsetMs?: bigint;
    minTokens?: number;
    commitmentOverrides?: Partial<ExecutionCommitment>;
  }
) {
  const committed = await createCommittedTask(env, options);
  await env.buyerSdk.fundTask(committed.taskId, {
    validateCommitment: {
      acceptedHosts: ["api.openai.com"],
      acceptedPaths: ["/v1/chat/completions"],
      acceptedMethods: ["POST"],
      acceptedModels: committed.commitment.allowedModels,
      expectedVerifier: env.verifierWallet.address,
      minTotalTokens: committed.commitment.minUsage.totalTokens,
      requireNonZeroMinUsage: true
    }
  });
  const fundedTask = await env.settlement.getTask(committed.taskId);

  return {
    ...committed,
    fundedAt: fundedTask.fundedAtMs as bigint
  };
}

async function createProofSubmittedTask(
  env: LiveBoundaryEnvironment,
  options: {
    amount: bigint;
    minTokens?: number;
    scenario?: MockScenario;
    commitmentMinTokens?: number;
    deadlineOffsetMs?: bigint;
  }
) {
  const funded = await createCommittedFundedTask(env, options);
  const proof = await buildUploadedProof(env, {
    commitment: funded.commitment,
    taskNonce: funded.taskNonce,
    scenario: options.scenario,
    commitmentMinTokens: options.commitmentMinTokens,
    timeWindow:
      options.scenario === "timestamp_before_funded"
        ? { fundedAt: funded.fundedAt }
        : undefined,
    observedAt:
      options.scenario === undefined || options.scenario === "pass" || options.scenario === "model_mismatch" || options.scenario === "usage_insufficient"
        ? await env.settlement.currentTimeMs()
        : undefined
  });

  await env.sellerAgent.submitProofBundleHash(
    env.settlement.connect(env.sellerWallet) as unknown as import("@fulfillpay/seller-sdk").ContractLike,
    funded.taskId as Bytes32,
    proof.proofBundleHash,
    proof.proofBundleURI
  );

  const task = await env.settlement.getTask(funded.taskId);

  return {
    ...funded,
    proof,
    proofSubmittedAt: task.proofSubmittedAtMs as bigint
  };
}

async function buildUploadedProof(
  env: LiveBoundaryEnvironment,
  options: {
    commitment: ExecutionCommitment;
    taskNonce: Bytes32;
    observedAt?: bigint;
    scenario?: MockScenario;
    commitmentMinTokens?: number;
    totalTokens?: number;
    timeWindow?: MockTimeWindow;
    requestBodyOverride?: unknown;
    callIndex?: number;
  }
) {
  const taskContext = env.sellerAgent.buildTaskContextFromCommitment(options.commitment, options.taskNonce);
  const callIndex = options.callIndex ?? 0;
  const request = {
    host: options.commitment.target.host,
    path: options.commitment.target.path,
    method: options.commitment.target.method,
    body: options.requestBodyOverride ?? {
      model: options.commitment.allowedModels[0],
      messages: [{ role: "user", content: `live-boundary-${callIndex}` }]
    }
  };
  const callIntentHash = buildCallIntentHash({
    taskContext,
    callIndex,
    host: request.host,
    path: request.path,
    method: request.method,
    declaredModel: options.commitment.allowedModels[0],
    requestBodyHash: hashObject(request.body)
  });
  const provenFetch = await env.zkTlsAdapter.provenFetch({
    taskContext,
    callIndex,
    callIntentHash,
    request,
    declaredModel: options.commitment.allowedModels[0],
    scenario: options.scenario ?? "pass",
    totalTokens: options.totalTokens,
    commitmentMinTokens: options.commitmentMinTokens,
    timeWindow: options.timeWindow,
    observedAt: options.observedAt
  });
  const rawProofPointer = await env.storage.putObject(provenFetch.rawProof, { namespace: "raw-proofs" });
  const receipt = await env.zkTlsAdapter.normalizeReceipt(provenFetch.rawProof, {
    taskContext,
    callIndex,
    callIntentHash,
    rawProofURI: rawProofPointer.uri
  });

  return buildProofBundleFromReceipts(env, options.commitment, [receipt]);
}

async function buildProofBundleFromReceipts(
  env: LiveBoundaryEnvironment,
  commitment: ExecutionCommitment,
  receipts: DeliveryReceipt[]
) {
  const proofBundle = env.sellerAgent.buildProofBundle({
    commitment,
    receipts
  });
  const proofBundlePointer = await env.storage.putObject(proofBundle, { namespace: "proof-bundles" });

  return {
    proofBundleHash: proofBundlePointer.hash as Bytes32,
    proofBundleURI: proofBundlePointer.uri
  };
}

async function verifyAndSettle(env: LiveBoundaryEnvironment, taskId: string) {
  const verificationResult = await callVerifier(env.verifierBaseUrl, taskId);
  await (
    await env.settlement
      .connect(env.buyerWallet)
      .settle(toSettlementReportStruct(verificationResult.report), verificationResult.report.signature)
  ).wait();
  return verificationResult;
}

async function buildSignedSettlementReport(
  env: LiveBoundaryEnvironment,
  options: {
    taskId: Bytes32;
    buyer: string;
    seller: string;
    commitmentHash: Bytes32;
    proofBundleHash: Bytes32;
    passed: boolean;
    settlementAction: number;
    settlementAmount: bigint;
    signer?: SigningWallet;
    chainId?: bigint;
    verifyingContract?: string;
    reportHashSeed: string;
  }
) {
  const signer = options.signer ?? env.verifierWallet;
  const chainId = options.chainId ?? env.chainId;
  const verifyingContract = options.verifyingContract ?? await env.settlement.getAddress();
  const verifiedAt = BigInt(await env.settlement.currentTimeMs());
  const reportHash = bytes32FromSeed(options.reportHashSeed);

  const report = {
    taskId: options.taskId,
    buyer: options.buyer,
    seller: options.seller,
    commitmentHash: options.commitmentHash,
    proofBundleHash: options.proofBundleHash,
    passed: options.passed,
    settlementAction: options.settlementAction,
    settlementAmount: options.settlementAmount,
    verifiedAt,
    reportHash
  };

  const signature = await signer.signTypedData(
    {
      name: "FulfillPay",
      version: "1",
      chainId,
      verifyingContract
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

  return { report, signature };
}

function buildCommitment(input: {
  taskId: Bytes32;
  buyer: string;
  seller: string;
  deadlineMs: bigint;
  verifier: string;
  minTokens?: number;
  overrides?: Partial<ExecutionCommitment>;
}): ExecutionCommitment {
  return {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: input.taskId,
    buyer: normalizeAddress(input.buyer, "buyer"),
    seller: normalizeAddress(input.seller, "seller"),
    target: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    allowedModels: ["gpt-4.1-mini"],
    minUsage: {
      totalTokens: input.minTokens ?? 100
    },
    deadline: input.deadlineMs.toString(),
    verifier: normalizeAddress(input.verifier, "verifier"),
    ...input.overrides
  };
}

async function callVerifier(baseUrl: string, taskId: string) {
  const response = await fetch(new URL("/verify", baseUrl).href, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      taskId,
      markProofsConsumed: true
    })
  });

  const payload = await response.json() as {
    report?: VerificationReport;
    checks?: Record<string, boolean>;
    aggregateUsage?: { totalTokens: number };
    error?: string;
    message?: string;
  };

  if (!response.ok || !payload.report || !payload.checks || !payload.aggregateUsage) {
    throw new Error(`Verifier request failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as {
    report: VerificationReport;
    checks: Record<string, boolean>;
    aggregateUsage: { totalTokens: number };
  };
}

async function defaultDeadlineMs(settlement: FulfillPaySettlement, offsetMs = 60_000n) {
  return BigInt(await settlement.currentTimeMs()) + offsetMs;
}

async function waitUntilOnChainMs(settlement: FulfillPaySettlement, targetMs: bigint) {
  for (;;) {
    const nowMs = BigInt(await settlement.currentTimeMs());
    if (nowMs >= targetMs) {
      return;
    }

    const remainingMs = targetMs - nowMs;
    await sleep(Number(remainingMs > 1_000n ? 1_000n : remainingMs));
  }
}

async function runCase(
  results: Array<{ name: string; details?: string }>,
  name: string,
  fn: () => Promise<void>
) {
  console.log(`Running case: ${name}`);
  await fn();
  results.push({ name });
  console.log(`Completed case: ${name}`);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function bytes32FromSeed(seed: string): Bytes32 {
  return keccak256(toUtf8Bytes(seed)) as Bytes32;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function hasCustomErrorSelector(error: unknown, selector: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    data?: string;
    info?: { error?: { data?: string } };
  };

  const data = candidate.data ?? candidate.info?.error?.data;
  return typeof data === "string" && data.startsWith(selector);
}

function normalizePrivateKey(input: string): string {
  return input.startsWith("0x") ? input : `0x${input}`;
}

async function listenOnEphemeralPort(server: Server): Promise<string> {
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        throw new Error("Verifier server failed to bind.");
      }

      resolve(address.port);
    });
  });

  return `http://127.0.0.1:${port}`;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
