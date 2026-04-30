import assert from "node:assert/strict";

import {
  buildVerificationReportTypedData,
  hashVerificationReport,
  SCHEMA_VERSIONS,
  type ExecutionCommitment,
  type VerificationReport
} from "@fulfillpay/sdk-core";
import { MemoryStorageAdapter } from "@fulfillpay/storage-adapter";

import { BuyerSdk, BuyerSdkConfigurationError, BuyerSdkValidationError, type BuyerTask, type VerificationReportResolver } from "../dist/index.js";

class InMemoryReportResolver implements VerificationReportResolver {
  private readonly reports = new Map<string, VerificationReport>();

  setReport(report: VerificationReport) {
    this.reports.set(report.reportHash ?? hashVerificationReport(report), report);
  }

  async getReport(input: { task: BuyerTask; taskId: `0x${string}`; reportHash: `0x${string}` }) {
    return this.reports.get(input.reportHash) ?? null;
  }
}

export async function runBuyerSdkIntegration(ethers: any) {
  const [owner, buyer, seller, verifier] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const verifierRegistryFactory = await ethers.getContractFactory("VerifierRegistry", owner);
  const verifierRegistry = await verifierRegistryFactory.deploy(owner.address);
  await verifierRegistry.waitForDeployment();
  await (await verifierRegistry.addVerifier(verifier.address)).wait();

  const settlementFactory = await ethers.getContractFactory("FulfillPaySettlement", owner);
  const settlement = await settlementFactory.deploy(
    await verifierRegistry.getAddress(),
    15n * 60n * 1000n,
    60n * 60n * 1000n
  );
  await settlement.waitForDeployment();

  const mockTokenFactory = await ethers.getContractFactory("MockERC20", owner);
  const mockToken = await mockTokenFactory.deploy("FulfillPay Mock USD", "fpUSD", owner.address, 0);
  await mockToken.waitForDeployment();

  await (await settlement.setAllowedToken(await mockToken.getAddress(), true)).wait();
  await (await mockToken.mint(buyer.address, 10_000_000n)).wait();
  await (await mockToken.connect(buyer).approve(await settlement.getAddress(), 10_000_000n)).wait();

  const storage = new MemoryStorageAdapter();
  const reportResolver = new InMemoryReportResolver();
  const buyerSdk = new BuyerSdk({
    settlementAddress: await settlement.getAddress(),
    signer: buyer,
    storage,
    reportResolver
  });

  await exerciseHappyPath({
    buyerSdk,
    storage,
    reportResolver,
    settlement,
    mockToken,
    buyer,
    seller,
    verifier,
    chainId
  });

  await exerciseCommitmentValidationBoundary({
    buyerSdk,
    storage,
    settlement,
    mockToken,
    buyer,
    seller,
    verifier
  });

  await exerciseExpiredDerivedStatus({
    ethers,
    buyerSdk,
    storage,
    settlement,
    mockToken,
    buyer,
    seller,
    verifier
  });

  await exerciseFundTaskRequiresCommitmentRead({
    buyer,
    settlement,
    mockToken
  });

  await exerciseRefundAfterProofSubmissionDeadline({
    ethers,
    buyerSdk,
    storage,
    settlement,
    mockToken,
    buyer,
    seller,
    verifier
  });

  await exerciseRefundAfterVerificationTimeout({
    ethers,
    buyerSdk,
    storage,
    settlement,
    mockToken,
    buyer,
    seller,
    verifier
  });
}

async function exerciseHappyPath(input: {
  buyerSdk: BuyerSdk;
  storage: MemoryStorageAdapter;
  reportResolver: InMemoryReportResolver;
  settlement: any;
  mockToken: any;
  buyer: any;
  seller: any;
  verifier: any;
  chainId: bigint;
}) {
  const currentTimeMs = await input.settlement.currentTimeMs();
  const deadlineMs = currentTimeMs + 60n * 60n * 1000n;
  const created = await input.buyerSdk.createTaskIntent({
    seller: input.seller.address,
    token: await input.mockToken.getAddress(),
    amount: 1_000_000n,
    deadline: deadlineMs,
    metadataURI: "ipfs://buyer/task/1"
  });

  assert.equal(created.taskIntent.buyer, input.buyer.address.toLowerCase());
  assert.equal(created.taskIntent.seller, input.seller.address.toLowerCase());
  assert.equal(created.taskIntent.amount, "1000000");

  const commitment: ExecutionCommitment = {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: created.taskId,
    buyer: input.buyer.address.toLowerCase() as `0x${string}`,
    seller: input.seller.address.toLowerCase() as `0x${string}`,
    target: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    allowedModels: ["gpt-4.1-mini"],
    minUsage: {
      totalTokens: 500
    },
    deadline: deadlineMs.toString(),
    verifier: input.verifier.address.toLowerCase() as `0x${string}`
  };
  const pointer = await input.storage.putObject(commitment, { namespace: "commitments" });

  await (await input.settlement.connect(input.seller).submitCommitment(created.taskId, pointer.hash, pointer.uri)).wait();

  const loadedCommitment = await input.buyerSdk.getCommitment(created.taskId);
  assert.deepEqual(loadedCommitment.commitment, commitment);

  const validatedCommitment = await input.buyerSdk.validateCommitment(created.taskId, {
    acceptedHosts: ["api.openai.com"],
    acceptedPaths: ["/v1/chat/completions"],
    acceptedMethods: ["POST"],
    acceptedModels: ["gpt-4.1-mini"],
    expectedVerifier: input.verifier.address,
    minTotalTokens: 500,
    requireNonZeroMinUsage: true,
    nowMs: currentTimeMs.toString()
  });
  assert.equal(validatedCommitment.commitmentHash, pointer.hash);

  await input.buyerSdk.fundTask(created.taskId, {
    validateCommitment: {
      acceptedHosts: ["api.openai.com"],
      acceptedPaths: ["/v1/chat/completions"],
      acceptedMethods: ["POST"],
      acceptedModels: ["gpt-4.1-mini"],
      expectedVerifier: input.verifier.address,
      minTotalTokens: 500,
      requireNonZeroMinUsage: true
    }
  });

  const fundedTask = await input.buyerSdk.getTask(created.taskId);
  assert.equal(fundedTask.status, "FUNDED");
  assert.equal(await input.buyerSdk.getTaskStatus(created.taskId), "EXECUTING");

  const proofBundleHash = ethers.keccak256(ethers.toUtf8Bytes("buyer-sdk/proof-bundle/pass"));
  await (
    await input.settlement
      .connect(input.seller)
      .submitProofBundle(created.taskId, proofBundleHash, "ipfs://proof-bundles/pass")
  ).wait();

  const unsignedReport = {
    schemaVersion: SCHEMA_VERSIONS.verificationReport,
    chainId: input.chainId.toString(),
    settlementContract: (await input.settlement.getAddress()).toLowerCase() as `0x${string}`,
    taskId: created.taskId,
    buyer: input.buyer.address.toLowerCase() as `0x${string}`,
    seller: input.seller.address.toLowerCase() as `0x${string}`,
    commitmentHash: pointer.hash,
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
    aggregateUsage: {
      totalTokens: 640
    },
    settlement: {
      action: "RELEASE" as const,
      amount: "1000000"
    },
    verifier: input.verifier.address.toLowerCase() as `0x${string}`,
    verifiedAt: (await input.settlement.currentTimeMs()).toString()
  };
  const reportHash = hashVerificationReport(unsignedReport);
  const typedData = buildVerificationReportTypedData({
    ...unsignedReport,
    reportHash
  });
  const signature = await input.verifier.signTypedData(typedData.domain, typedData.types, typedData.message);
  const signedReport: VerificationReport = {
    ...unsignedReport,
    reportHash,
    signature
  };

  input.reportResolver.setReport(signedReport);

  await (await input.settlement.settle(typedData.message, signature)).wait();

  assert.equal(await input.buyerSdk.getTaskStatus(created.taskId), "SETTLED");

  const reportRecord = await input.buyerSdk.getReport(created.taskId);
  assert.equal(reportRecord.reportHash, reportHash);
  assert.deepEqual(reportRecord.report, signedReport);
}

async function exerciseCommitmentValidationBoundary(input: {
  buyerSdk: BuyerSdk;
  storage: MemoryStorageAdapter;
  settlement: any;
  mockToken: any;
  buyer: any;
  seller: any;
  verifier: any;
}) {
  const deadlineMs = (await input.settlement.currentTimeMs()) + 60n * 60n * 1000n;
  const created = await input.buyerSdk.createTaskIntent({
    seller: input.seller.address,
    token: await input.mockToken.getAddress(),
    amount: 2_000_000n,
    deadline: deadlineMs
  });

  const lowUsageCommitment: ExecutionCommitment = {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: created.taskId,
    buyer: input.buyer.address.toLowerCase() as `0x${string}`,
    seller: input.seller.address.toLowerCase() as `0x${string}`,
    target: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    allowedModels: ["gpt-4.1-mini"],
    minUsage: {
      totalTokens: 0
    },
    deadline: deadlineMs.toString(),
    verifier: input.verifier.address.toLowerCase() as `0x${string}`
  };
  const pointer = await input.storage.putObject(lowUsageCommitment, { namespace: "commitments" });

  await (await input.settlement.connect(input.seller).submitCommitment(created.taskId, pointer.hash, pointer.uri)).wait();

  await assert.rejects(
    () =>
      input.buyerSdk.validateCommitment(created.taskId, {
        requireNonZeroMinUsage: true
      }),
    BuyerSdkValidationError
  );
}

async function exerciseExpiredDerivedStatus(input: {
  ethers: any;
  buyerSdk: BuyerSdk;
  storage: MemoryStorageAdapter;
  settlement: any;
  mockToken: any;
  buyer: any;
  seller: any;
  verifier: any;
}) {
  const latestBlock = await input.ethers.provider.getBlock("latest");

  if (!latestBlock) {
    throw new Error("Latest block is unavailable.");
  }

  const deadlineMs = BigInt(latestBlock.timestamp + 5) * 1000n;
  const created = await input.buyerSdk.createTaskIntent({
    seller: input.seller.address,
    token: await input.mockToken.getAddress(),
    amount: 3_000_000n,
    deadline: deadlineMs
  });

  const commitment: ExecutionCommitment = {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: created.taskId,
    buyer: input.buyer.address.toLowerCase() as `0x${string}`,
    seller: input.seller.address.toLowerCase() as `0x${string}`,
    target: {
      host: "api.openai.com",
      path: "/v1/responses",
      method: "POST"
    },
    allowedModels: ["gpt-4.1-mini"],
    minUsage: {
      totalTokens: 1
    },
    deadline: deadlineMs.toString(),
    verifier: input.verifier.address.toLowerCase() as `0x${string}`
  };
  const pointer = await input.storage.putObject(commitment, { namespace: "commitments" });

  await (await input.settlement.connect(input.seller).submitCommitment(created.taskId, pointer.hash, pointer.uri)).wait();
  await input.ethers.provider.send("evm_increaseTime", [10]);
  await input.ethers.provider.send("evm_mine", []);

  assert.equal(await input.buyerSdk.getTaskStatus(created.taskId), "EXPIRED");
}

async function exerciseFundTaskRequiresCommitmentRead(input: {
  buyer: any;
  settlement: any;
  mockToken: any;
}) {
  const buyerSdkWithoutStorage = new BuyerSdk({
    settlementAddress: await input.settlement.getAddress(),
    signer: input.buyer
  });
  const deadlineMs = (await input.settlement.currentTimeMs()) + 60n * 60n * 1000n;
  const created = await buyerSdkWithoutStorage.createTaskIntent({
    seller: input.buyer.address,
    token: await input.mockToken.getAddress(),
    amount: 10n,
    deadline: deadlineMs
  });

  await assert.rejects(() => buyerSdkWithoutStorage.fundTask(created.taskId), BuyerSdkConfigurationError);
}

async function exerciseRefundAfterProofSubmissionDeadline(input: {
  ethers: any;
  buyerSdk: BuyerSdk;
  storage: MemoryStorageAdapter;
  settlement: any;
  mockToken: any;
  buyer: any;
  seller: any;
  verifier: any;
}) {
  const deadlineMs = (await input.settlement.currentTimeMs()) + 60n * 60n * 1000n;
  const created = await input.buyerSdk.createTaskIntent({
    seller: input.seller.address,
    token: await input.mockToken.getAddress(),
    amount: 40_000n,
    deadline: deadlineMs
  });

  const pointer = await submitValidCommitment({
    storage: input.storage,
    settlement: input.settlement,
    taskId: created.taskId,
    buyer: input.buyer,
    seller: input.seller,
    verifier: input.verifier,
    deadlineMs,
    targetPath: "/v1/chat/completions"
  });

  await input.buyerSdk.fundTask(created.taskId, {
    validateCommitment: {
      acceptedHosts: ["api.openai.com"],
      acceptedPaths: ["/v1/chat/completions"],
      acceptedMethods: ["POST"],
      acceptedModels: ["gpt-4.1-mini"],
      expectedVerifier: input.verifier.address
    }
  });
  assert.equal(pointer.commitment.taskId, created.taskId);

  await input.ethers.provider.send("evm_increaseTime", [76 * 60]);
  await input.ethers.provider.send("evm_mine", []);
  await input.buyerSdk.refundAfterProofSubmissionDeadline(created.taskId);

  assert.equal(await input.buyerSdk.getTaskStatus(created.taskId), "REFUNDED");
}

async function exerciseRefundAfterVerificationTimeout(input: {
  ethers: any;
  buyerSdk: BuyerSdk;
  storage: MemoryStorageAdapter;
  settlement: any;
  mockToken: any;
  buyer: any;
  seller: any;
  verifier: any;
}) {
  const deadlineMs = (await input.settlement.currentTimeMs()) + 60n * 60n * 1000n;
  const created = await input.buyerSdk.createTaskIntent({
    seller: input.seller.address,
    token: await input.mockToken.getAddress(),
    amount: 50_000n,
    deadline: deadlineMs
  });

  const pointer = await submitValidCommitment({
    storage: input.storage,
    settlement: input.settlement,
    taskId: created.taskId,
    buyer: input.buyer,
    seller: input.seller,
    verifier: input.verifier,
    deadlineMs,
    targetPath: "/v1/responses"
  });

  await input.buyerSdk.fundTask(created.taskId, {
    validateCommitment: {
      acceptedHosts: ["api.openai.com"],
      acceptedPaths: ["/v1/responses"],
      acceptedMethods: ["POST"],
      acceptedModels: ["gpt-4.1-mini"],
      expectedVerifier: input.verifier.address
    }
  });

  const proofBundleHash = input.ethers.keccak256(input.ethers.toUtf8Bytes(`buyer-sdk/proof-bundle/timeout/${created.taskId}`));
  await (
    await input.settlement
      .connect(input.seller)
      .submitProofBundle(created.taskId, proofBundleHash, `ipfs://proof-bundles/${created.taskId}`)
  ).wait();
  assert.equal(pointer.commitment.taskId, created.taskId);

  await input.ethers.provider.send("evm_increaseTime", [61 * 60]);
  await input.ethers.provider.send("evm_mine", []);
  await input.buyerSdk.refundAfterVerificationTimeout(created.taskId);

  assert.equal(await input.buyerSdk.getTaskStatus(created.taskId), "REFUNDED");
}

async function submitValidCommitment(input: {
  storage: MemoryStorageAdapter;
  settlement: any;
  taskId: `0x${string}`;
  buyer: any;
  seller: any;
  verifier: any;
  deadlineMs: bigint;
  targetPath: string;
}) {
  const commitment: ExecutionCommitment = {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: input.taskId,
    buyer: input.buyer.address.toLowerCase() as `0x${string}`,
    seller: input.seller.address.toLowerCase() as `0x${string}`,
    target: {
      host: "api.openai.com",
      path: input.targetPath,
      method: "POST"
    },
    allowedModels: ["gpt-4.1-mini"],
    minUsage: {
      totalTokens: 1
    },
    deadline: input.deadlineMs.toString(),
    verifier: input.verifier.address.toLowerCase() as `0x${string}`
  };
  const pointer = await input.storage.putObject(commitment, { namespace: "commitments" });

  await (await input.settlement.connect(input.seller).submitCommitment(input.taskId, pointer.hash, pointer.uri)).wait();

  return {
    commitment,
    pointer
  };
}
