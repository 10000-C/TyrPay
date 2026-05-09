import assert from "node:assert/strict";
import { type Server } from "node:http";
import path from "node:path";

import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { JsonRpcProvider, Wallet } from "ethers";

import {
  SCHEMA_VERSIONS,
  buildCallIntentHash,
  hashExecutionCommitment,
  hashObject,
  normalizeAddress,
  type Address,
  type Bytes32,
  type ExecutionCommitment,
  type ProofBundle,
  type URI,
  type VerificationReport
} from "@fulfillpay/sdk-core";
import { BuyerSdk } from "@fulfillpay/buyer-sdk";
import { SellerAgent } from "@fulfillpay/seller-sdk";
import {
  CentralizedVerifier,
  EthersSettlementTaskReader,
  InMemoryProofConsumptionRegistry,
  createVerifierHttpServer,
  toSettlementReportStruct
} from "@fulfillpay/verifier-service";
import { MockZkTlsAdapter } from "@fulfillpay/zktls-adapter";

import {
  FulfillPaySettlement__factory,
  MockERC20__factory,
  VerifierRegistry__factory
} from "../typechain-types";
import {
  ZeroGStorageAdapter,
  createZeroGStorageTransport,
  type StorageAdapter
} from "@fulfillpay/storage-adapter";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const DEFAULT_AMOUNT = 1_000_000n;
const DEFAULT_MINT_AMOUNT = 10_000_000n;

async function main() {
  const rpcUrl = requireEnv("ZERO_G_EVM_RPC");
  const settlementAddress = normalizeAddress(requireEnv("SETTLEMENT_CONTRACT"), "SETTLEMENT_CONTRACT");
  const buyerWallet = buildWalletFromEnv("BUYER_PRIVATE_KEY", rpcUrl);
  const sellerWallet = buildWalletFromEnv("SELLER_PRIVATE_KEY", rpcUrl);
  const verifierWallet = buildWalletFromEnv("VERIFIER_PRIVATE_KEY", rpcUrl);
  const ownerWallet = buildWalletFromEnv("CONTRACT_OWNER_PRIVATE_KEY", rpcUrl);

  const provider = buyerWallet.provider;
  if (!provider) {
    throw new Error("Buyer wallet provider is unavailable.");
  }

  const network = await provider.getNetwork();
  const envChainId = process.env.CHAIN_ID?.trim();
  if (envChainId && BigInt(envChainId) !== network.chainId) {
    throw new Error(`CHAIN_ID=${envChainId} does not match provider chainId=${network.chainId.toString()}.`);
  }

  const settlement = FulfillPaySettlement__factory.connect(settlementAddress, buyerWallet);
  const settlementAsOwner = settlement.connect(ownerWallet);
  const settlementAsSeller = settlement.connect(sellerWallet);

  const verifierRegistryAddress = normalizeAddress(await settlement.verifierRegistry(), "verifierRegistry");
  const verifierRegistry = VerifierRegistry__factory.connect(verifierRegistryAddress, ownerWallet);

  await ensureOwnerAccess(settlementAsOwner, verifierRegistry, ownerWallet.address);
  await ensureVerifierAuthorized(verifierRegistry, verifierWallet.address);

  const mockToken = await deployAndAllowMockToken(settlementAsOwner, ownerWallet);
  await fundBuyerAndApprove(mockToken, buyerWallet, settlementAddress);

  const storage = new ZeroGStorageAdapter({
    transport: createZeroGStorageTransport({
      indexer: requireEnv("ZERO_G_INDEXER_RPC"),
      evmRpc: rpcUrl,
      signer: sellerWallet,
      withProof: true
    })
  });
  const zkTlsAdapter = new MockZkTlsAdapter();
  const buyerSdk = new BuyerSdk({
    settlementAddress,
    signer: buyerWallet as unknown as ConstructorParameters<typeof BuyerSdk>[0]["signer"],
    storage
  });
  const sellerAgent = new SellerAgent({
    signer: sellerWallet as unknown as import("@fulfillpay/seller-sdk").Signer,
    settlementContract: settlementAddress,
    chainId: network.chainId.toString(),
    storageAdapter: storage,
    zkTlsAdapter
  });

  const verifierService = new CentralizedVerifier({
    settlement: new EthersSettlementTaskReader({
      settlementAddress,
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

  try {
    const currentTimeMs = await settlement.currentTimeMs();
    const deadlineMs = currentTimeMs + 60n * 60n * 1000n;
    const taskMetadata = {
      kind: "live-e2e-task-metadata",
      chainId: network.chainId.toString(),
      settlement: settlementAddress,
      seller: sellerWallet.address,
      verifier: verifierWallet.address,
      createdAt: currentTimeMs.toString(),
      note: "mockZK live loop with real 0G storage"
    };
    const metadataPointer = await storage.putObject(taskMetadata, { namespace: "task-metadata" });

    const created = await buyerSdk.createTaskIntent({
      seller: sellerWallet.address,
      token: await mockToken.getAddress(),
      amount: DEFAULT_AMOUNT,
      deadline: deadlineMs,
      metadataHash: metadataPointer.hash,
      metadataURI: metadataPointer.uri
    });
    await expectTaskStatus(buyerSdk, created.taskId, "INTENT_CREATED");

    const commitment = buildCommitment({
      taskId: created.taskId,
      buyer: buyerWallet.address,
      seller: sellerWallet.address,
      deadlineMs,
      verifier: verifierWallet.address
    });
    const commitmentPointer = await storage.putObject(commitment, { namespace: "commitments" });
    await sellerAgent.submitCommitment(
      settlementAsSeller as unknown as import("@fulfillpay/seller-sdk").ContractLike,
      commitment,
      commitmentPointer.uri
    );
    await expectTaskStatus(buyerSdk, created.taskId, "COMMITMENT_SUBMITTED");

    await buyerSdk.fundTask(created.taskId, {
      validateCommitment: {
        acceptedHosts: ["api.openai.com"],
        acceptedPaths: ["/v1/chat/completions"],
        acceptedMethods: ["POST"],
        acceptedModels: ["gpt-4.1-mini"],
        expectedVerifier: verifierWallet.address,
        minTotalTokens: 100,
        requireNonZeroMinUsage: true
      }
    });
    await expectTaskStatus(buyerSdk, created.taskId, "FUNDED");
    assert.equal(await buyerSdk.getTaskStatus(created.taskId), "EXECUTING");

    await assert.rejects(
      () => verifierService.verifyTask(created.taskId, { markProofsConsumed: false }),
      /PROOF_SUBMITTED/
    );

    const proofOutput = await buildAndSubmitMockProof({
      sellerAgent,
      storage,
      zkTlsAdapter,
      commitment,
      taskNonce: created.taskNonce,
      observedAt: await settlement.currentTimeMs()
    });
    await sellerAgent.submitProofBundleHash(
      settlementAsSeller as unknown as import("@fulfillpay/seller-sdk").ContractLike,
      created.taskId as Bytes32,
      proofOutput.proofBundleHash,
      proofOutput.proofBundleUri
    );
    await expectTaskStatus(buyerSdk, created.taskId, "PROOF_SUBMITTED");

    const verificationResult = await callVerifier(verifierBaseUrl, created.taskId);
    assert.equal(verificationResult.report.passed, true);
    assert.equal(verificationResult.reportPointer.hash, hashObject(verificationResult.report));
    assert.equal(verificationResult.report.settlement.action, "RELEASE");
    assert.equal(verificationResult.checks.callIndicesUnique, true);
    assert.equal(verificationResult.checks.withinTaskWindow, true);
    assert.equal(verificationResult.checks.modelMatched, true);
    assert.equal(verificationResult.checks.usageSatisfied, true);

    await (
      await settlement.settle(
        toSettlementReportStruct(verificationResult.report),
        verificationResult.report.signature
      )
    ).wait();
    await expectTaskStatus(buyerSdk, created.taskId, "SETTLED");

    const sellerBalance = await mockToken.balanceOf(sellerWallet.address);
    const escrowBalance = await mockToken.balanceOf(settlementAddress);
    assert.equal(sellerBalance, DEFAULT_AMOUNT);
    assert.equal(escrowBalance, 0n);

    const restoredMetadata = await storage.getObject<typeof taskMetadata>(metadataPointer, {
      expectedHash: metadataPointer.hash
    });
    const restoredCommitment = await storage.getObject<ExecutionCommitment>(commitmentPointer, {
      expectedHash: commitmentPointer.hash
    });
    const restoredRawProof = await storage.getObject<typeof proofOutput.rawProof>(proofOutput.rawProofPointer, {
      expectedHash: proofOutput.rawProofPointer.hash
    });
    const restoredReceipt = await storage.getObject<typeof proofOutput.receipt>(proofOutput.receiptPointer, {
      expectedHash: proofOutput.receiptPointer.hash
    });
    const restoredProofBundle = await storage.getObject<ProofBundle>(proofOutput.proofBundlePointer, {
      expectedHash: proofOutput.proofBundlePointer.hash
    });
    const restoredReport = await storage.getObject<VerificationReport>(verificationResult.reportPointer, {
      expectedHash: verificationResult.reportPointer.hash
    });

    assert.deepEqual(restoredMetadata, taskMetadata);
    assert.deepEqual(restoredCommitment, commitment);
    assert.deepEqual(restoredRawProof, proofOutput.rawProof);
    assert.deepEqual(restoredReceipt, proofOutput.receipt);
    assert.equal(restoredProofBundle.taskId, created.taskId);
    assert.equal(restoredProofBundle.commitmentHash, commitmentPointer.hash);
    assert.deepEqual(restoredReport, verificationResult.report);

    console.log(`E2E mock loop passed on chain ${network.chainId.toString()}.`);
    console.log(`Settlement: ${settlementAddress}`);
    console.log(`VerifierRegistry: ${verifierRegistryAddress}`);
    console.log(`MockToken: ${await mockToken.getAddress()}`);
    console.log(`TaskId: ${created.taskId}`);
    console.log(`ProofBundleHash: ${proofOutput.proofBundleHash}`);
    console.log(`MetadataURI: ${metadataPointer.uri}`);
    console.log(`CommitmentURI: ${commitmentPointer.uri}`);
    console.log(`RawProofURI: ${proofOutput.rawProofPointer.uri}`);
    console.log(`ReceiptURI: ${proofOutput.receiptPointer.uri}`);
    console.log(`ProofBundleURI: ${proofOutput.proofBundleUri}`);
    console.log(`ReportURI: ${verificationResult.reportPointer.uri}`);
  } finally {
    await closeServer(verifierServer);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function normalizePrivateKey(input: string): string {
  return input.startsWith("0x") ? input : `0x${input}`;
}

function buildWalletFromEnv(name: string, rpcUrl: string) {
  return new Wallet(normalizePrivateKey(requireEnv(name)), new JsonRpcProvider(rpcUrl));
}

async function ensureOwnerAccess(settlement: ReturnType<typeof FulfillPaySettlement__factory.connect>, verifierRegistry: ReturnType<typeof VerifierRegistry__factory.connect>, expectedOwner: string) {
  const settlementOwner = normalizeAddress(await settlement.owner(), "settlement.owner");
  const registryOwner = normalizeAddress(await verifierRegistry.owner(), "verifierRegistry.owner");
  const normalizedExpectedOwner = normalizeAddress(expectedOwner, "CONTRACT_OWNER_PRIVATE_KEY");

  if (settlementOwner !== normalizedExpectedOwner) {
    throw new Error(`Settlement owner mismatch: expected ${normalizedExpectedOwner}, got ${settlementOwner}.`);
  }
  if (registryOwner !== normalizedExpectedOwner) {
    throw new Error(`VerifierRegistry owner mismatch: expected ${normalizedExpectedOwner}, got ${registryOwner}.`);
  }
}

async function ensureVerifierAuthorized(verifierRegistry: ReturnType<typeof VerifierRegistry__factory.connect>, verifier: string) {
  if (!(await verifierRegistry.isVerifier(verifier))) {
    await (await verifierRegistry.addVerifier(verifier)).wait();
  }
}

async function deployAndAllowMockToken(
  settlement: ReturnType<typeof FulfillPaySettlement__factory.connect>,
  ownerWallet: Wallet
) {
  const mockToken = await new MockERC20__factory(ownerWallet).deploy(
    "FulfillPay Mock USD",
    "fpUSD",
    ownerWallet.address,
    0n
  );
  await mockToken.waitForDeployment();

  const tokenAddress = await mockToken.getAddress();
  if (!(await settlement.allowedTokens(tokenAddress))) {
    await (await settlement.setAllowedToken(tokenAddress, true)).wait();
  }

  return mockToken;
}

async function fundBuyerAndApprove(
  mockToken: ReturnType<typeof MockERC20__factory.connect>,
  buyerWallet: Wallet,
  settlementAddress: string
) {
  await (await mockToken.mint(buyerWallet.address, DEFAULT_MINT_AMOUNT)).wait();
  await (await mockToken.connect(buyerWallet).approve(settlementAddress, DEFAULT_MINT_AMOUNT)).wait();
}

function buildCommitment(input: {
  taskId: Bytes32;
  buyer: string;
  seller: string;
  deadlineMs: bigint;
  verifier: string;
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
      totalTokens: 100
    },
    deadline: input.deadlineMs.toString(),
    verifier: normalizeAddress(input.verifier, "verifier")
  };
}

async function buildAndSubmitMockProof(input: {
  sellerAgent: SellerAgent;
  storage: StorageAdapter;
  zkTlsAdapter: MockZkTlsAdapter;
  commitment: ExecutionCommitment;
  taskNonce: Bytes32;
  observedAt: bigint;
}) {
  const taskContext = input.sellerAgent.buildTaskContextFromCommitment(input.commitment, input.taskNonce);
  const request = {
    host: input.commitment.target.host,
    path: input.commitment.target.path,
    method: input.commitment.target.method,
    body: {
      model: input.commitment.allowedModels[0],
      messages: [{ role: "user", content: "prove this fulfillment" }]
    }
  };
  const callIntentHash = buildCallIntentHash({
    taskContext,
    callIndex: 0,
    host: request.host,
    path: request.path,
    method: request.method,
    declaredModel: input.commitment.allowedModels[0],
    requestBodyHash: hashObject(request.body)
  });
  const provenFetch = await input.zkTlsAdapter.provenFetch({
    taskContext,
    callIndex: 0,
    callIntentHash,
    request,
    declaredModel: input.commitment.allowedModels[0],
    scenario: "pass",
    observedAt: input.observedAt
  });
  const rawProofPointer = await input.storage.putObject(provenFetch.rawProof, { namespace: "raw-proofs" });
  const receipt = await input.zkTlsAdapter.normalizeReceipt(provenFetch.rawProof, {
    taskContext,
    callIndex: 0,
    callIntentHash,
    rawProofURI: rawProofPointer.uri
  });
  const receiptPointer = await input.storage.putObject(receipt, { namespace: "receipts" });
  const proofBundle = input.sellerAgent.buildProofBundle({
    commitment: input.commitment,
    receipts: [receipt]
  });
  const proofBundlePointer = await input.storage.putObject(proofBundle, { namespace: "proof-bundles" });

  assert.equal(hashExecutionCommitment(input.commitment), proofBundle.commitmentHash);

  return {
    rawProof: provenFetch.rawProof,
    rawProofPointer,
    receipt,
    receiptPointer,
    proofBundlePointer,
    proofBundleHash: proofBundlePointer.hash as Bytes32,
    proofBundleUri: proofBundlePointer.uri
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
    report?: {
      passed: boolean;
      settlement: { action: string };
      signature: string;
    };
    reportPointer?: {
      uri: string;
      hash: string;
    };
    checks?: Record<string, boolean>;
    aggregateUsage?: { totalTokens: number };
    error?: string;
    message?: string;
  };

  if (!response.ok || !payload.report || !payload.reportPointer || !payload.checks || !payload.aggregateUsage) {
    throw new Error(`Verifier request failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload as {
    report: VerificationReport;
    reportPointer: { uri: URI; hash: Bytes32 };
    checks: Record<string, boolean>;
    aggregateUsage: { totalTokens: number };
  };
}

async function expectTaskStatus(buyerSdk: BuyerSdk, taskId: string, expectedStatus: string) {
  const task = await buyerSdk.getTask(taskId);
  assert.equal(task.status, expectedStatus);
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
