import assert from "node:assert/strict";
import { type Server } from "node:http";
import path from "node:path";

import * as dotenv from "dotenv";
import { JsonRpcProvider, Wallet } from "ethers";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  hashExecutionCommitment,
  hashObject,
  normalizeAddress,
  type Address,
  type Bytes32,
  type ExecutionCommitment,
  type ProofBundle,
  type VerificationReport
} from "@fulfillpay/sdk-core";
import { BuyerSdk } from "@fulfillpay/buyer-sdk";
import { SellerAgent } from "@fulfillpay/seller-sdk";
import {
  ZeroGStorageAdapter,
  createZeroGStorageTransport,
  type StorageAdapter,
  type StoragePointer
} from "@fulfillpay/storage-adapter";
import {
  CentralizedVerifier,
  EthersSettlementTaskReader,
  InMemoryProofConsumptionRegistry,
  createVerifierHttpServer,
  toSettlementReportStruct,
  type VerificationResult
} from "@fulfillpay/verifier-service";
import { ReclaimZkTlsAdapter } from "@fulfillpay/zktls-adapter";

import {
  FulfillPaySettlement__factory,
  MockERC20__factory,
  VerifierRegistry__factory
} from "../typechain-types";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const DEFAULT_AMOUNT = 1_000_000n;
const DEFAULT_MINT_AMOUNT = 10_000_000n;
const DEFAULT_MIN_TOKENS = 1;
const DEFAULT_COMPLETIONS_PATH = "/chat/completions";

type TxRecord = {
  label: string;
  hash: string;
};

type UriRecord = {
  label: string;
  uri: string;
  hash?: string;
};

async function main() {
  const txs: TxRecord[] = [];
  const uris: UriRecord[] = [];
  let stage = "bootstrap";

  try {
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

    const modelConfig = resolveModelConfig();
    const minTotalTokens = resolveMinTotalTokens();
    const useTee = resolveReclaimUseTee();
    const settlement = FulfillPaySettlement__factory.connect(settlementAddress, buyerWallet);
    const settlementAsOwner = settlement.connect(ownerWallet);
    const settlementAsSeller = settlement.connect(sellerWallet);

    stage = "verifier-registry";
    const verifierRegistryAddress = normalizeAddress(await settlement.verifierRegistry(), "verifierRegistry");
    const verifierRegistry = VerifierRegistry__factory.connect(verifierRegistryAddress, ownerWallet);
    await ensureOwnerAccess(settlementAsOwner, verifierRegistry, ownerWallet.address);
    const authorizeTx = await ensureVerifierAuthorized(verifierRegistry, verifierWallet.address);
    if (authorizeTx) {
      txs.push({ label: "authorize verifier", hash: authorizeTx });
    }

    stage = "token-setup";
    const mockToken = await deployAndAllowMockToken(settlementAsOwner, ownerWallet, txs);
    await fundBuyerAndApprove(mockToken, buyerWallet, settlementAddress, txs);

    stage = "adapter-setup";
    const storage = new ZeroGStorageAdapter({
      transport: createZeroGStorageTransport({
        indexer: requireEnv("ZERO_G_INDEXER_RPC"),
        evmRpc: rpcUrl,
        signer: sellerWallet,
        withProof: true
      })
    });
    const zkTlsAdapter = new ReclaimZkTlsAdapter({
      appId: requireEnv("RECLAIM_APP_ID"),
      appSecret: requireEnv("RECLAIM_APP_SECRET")
    });
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
      stage = "task-metadata";
      const currentTimeMs = await settlement.currentTimeMs();
      const deadlineMs = currentTimeMs + 60n * 60n * 1000n;
      const taskMetadata = {
        kind: "live-e2e-reclaim-task-metadata",
        chainId: network.chainId.toString(),
        settlement: settlementAddress,
        seller: sellerWallet.address,
        verifier: verifierWallet.address,
        createdAt: currentTimeMs.toString(),
        modelHost: modelConfig.host,
        modelPath: modelConfig.path,
        modelName: modelConfig.model
      };
      const metadataPointer = await storage.putObject(taskMetadata, { namespace: "task-metadata" });
      pushPointer(uris, "metadata", metadataPointer);

      stage = "create-task-intent";
      const created = await buyerSdk.createTaskIntent({
        seller: sellerWallet.address,
        token: await mockToken.getAddress(),
        amount: DEFAULT_AMOUNT,
        deadline: deadlineMs,
        metadataHash: metadataPointer.hash,
        metadataURI: metadataPointer.uri
      });
      txs.push({ label: "create task intent", hash: getReceiptHash(created.receipt, "createTaskIntent") });
      await expectTaskStatus(buyerSdk, created.taskId, "INTENT_CREATED");

      stage = "submit-commitment";
      const commitment = buildCommitment({
        taskId: created.taskId,
        buyer: buyerWallet.address,
        seller: sellerWallet.address,
        deadlineMs,
        verifier: verifierWallet.address,
        host: modelConfig.host,
        path: modelConfig.path,
        model: modelConfig.model,
        minTotalTokens
      });
      const commitmentPointer = await storage.putObject(commitment, { namespace: "commitments" });
      pushPointer(uris, "commitment", commitmentPointer);
      const commitmentResult = await sellerAgent.submitCommitment(
        settlementAsSeller as unknown as import("@fulfillpay/seller-sdk").ContractLike,
        commitment,
        commitmentPointer.uri
      );
      txs.push({ label: "submit commitment", hash: commitmentResult.txHash });
      await expectTaskStatus(buyerSdk, created.taskId, "COMMITMENT_SUBMITTED");

      stage = "fund-task";
      const fundReceipt = await buyerSdk.fundTask(created.taskId, {
        validateCommitment: {
          acceptedHosts: [modelConfig.host],
          acceptedPaths: [modelConfig.path],
          acceptedMethods: ["POST"],
          acceptedModels: [modelConfig.model],
          expectedVerifier: verifierWallet.address,
          minTotalTokens,
          requireNonZeroMinUsage: true
        }
      });
      txs.push({ label: "fund task", hash: getReceiptHash(fundReceipt, "fundTask") });
      await expectTaskStatus(buyerSdk, created.taskId, "FUNDED");
      assert.equal(await buyerSdk.getTaskStatus(created.taskId), "EXECUTING");

      stage = "seller-proven-fetch";
      const proofPrompt = process.env.MODEL_TEST_PROMPT?.trim() || "Reply with a short sentence for proof generation.";
      const proofOutput = await sellerAgent.provenFetch({
        commitment,
        callIndex: 0,
        taskNonce: created.taskNonce,
        declaredModel: modelConfig.model,
        request: {
          host: modelConfig.host,
          path: modelConfig.path,
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: {
            model: modelConfig.model,
            messages: [{ role: "user", content: proofPrompt }],
            stream: false
          }
        },
        providerOptions: {
          privateOptions: {
            headers: {
              authorization: `Bearer ${requireEnv("MODEL_API_KEY")}`
            }
          },
          retries: 2,
          retryIntervalMs: 1000,
          useTee
        }
      });
      pushPointer(uris, "raw proof", proofOutput.rawProofPointer);
      pushPointer(uris, "receipt", proofOutput.receiptPointer);

      stage = "proof-bundle";
      const proofBundle = sellerAgent.buildProofBundle({
        commitment,
        receipts: [proofOutput.receipt]
      });
      const proofBundleUpload = await sellerAgent.uploadProofBundle(proofBundle);
      pushPointer(uris, "proof bundle", proofBundleUpload.pointer);
      const proofSubmitResult = await sellerAgent.submitProofBundleHash(
        settlementAsSeller as unknown as import("@fulfillpay/seller-sdk").ContractLike,
        created.taskId as Bytes32,
        proofBundleUpload.pointer.hash as Bytes32,
        proofBundleUpload.pointer.uri
      );
      txs.push({ label: "submit proof bundle", hash: proofSubmitResult.txHash });
      await expectTaskStatus(buyerSdk, created.taskId, "PROOF_SUBMITTED");

      stage = "verify-task";
      const verificationResult = await callVerifier(verifierBaseUrl, created.taskId);
      assert.equal(
        verificationResult.report.passed,
        true,
        `Verifier rejected proof bundle with checks: ${JSON.stringify(verificationResult.report.checks)}`
      );
      assert.equal(verificationResult.report.settlement.action, "RELEASE");
      pushPointer(uris, "verification report", verificationResult.reportPointer);

      stage = "settle";
      const settleTx = await settlement.settle(
        toSettlementReportStruct(verificationResult.report),
        verificationResult.report.signature
      );
      const settleReceipt = await settleTx.wait();
      txs.push({ label: "settle", hash: getReceiptHash(settleReceipt, "settle") });
      await expectTaskStatus(buyerSdk, created.taskId, "SETTLED");

      stage = "post-verify";
      const sellerBalance = await mockToken.balanceOf(sellerWallet.address);
      const escrowBalance = await mockToken.balanceOf(settlementAddress);
      assert.equal(sellerBalance, DEFAULT_AMOUNT);
      assert.equal(escrowBalance, 0n);

      const restoredProofBundle = await storage.getObject<ProofBundle>(proofBundleUpload.pointer, {
        expectedHash: proofBundleUpload.pointer.hash
      });
      const restoredReport = await storage.getObject<VerificationReport>(verificationResult.reportPointer, {
        expectedHash: verificationResult.reportPointer.hash
      });
      assert.equal(restoredProofBundle.taskId, created.taskId);
      assert.deepEqual(restoredReport, verificationResult.report);

      console.log(`SUCCESS: Reclaim E2E passed on chain ${network.chainId.toString()}.`);
      console.log(`TaskId: ${created.taskId}`);
      console.log(`Model endpoint: https://${modelConfig.host}${modelConfig.path}`);
      console.log("Transactions:");
      for (const tx of txs) {
        console.log(`- ${tx.label}: ${tx.hash}`);
      }
      console.log("Storage URIs:");
      for (const record of uris) {
        console.log(`- ${record.label}: ${record.uri}${record.hash ? ` (hash=${record.hash})` : ""}`);
      }
    } finally {
      await closeServer(verifierServer);
    }
  } catch (error) {
    console.error(`FAILURE: stage=${stage}`);
    console.error(`Reason: ${toErrorMessage(error)}`);
    if (txs.length > 0) {
      console.error("Transactions before failure:");
      for (const tx of txs) {
        console.error(`- ${tx.label}: ${tx.hash}`);
      }
    }
    if (uris.length > 0) {
      console.error("Storage URIs before failure:");
      for (const record of uris) {
        console.error(`- ${record.label}: ${record.uri}${record.hash ? ` (hash=${record.hash})` : ""}`);
      }
    }
    throw error;
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

function resolveModelConfig(): { host: string; path: string; model: string } {
  const baseUrl = new URL(requireEnv("MODEL_BASE_URL"));
  const normalizedPath = normalizeModelPath(baseUrl.pathname);

  return {
    host: baseUrl.host,
    path: normalizedPath,
    model: requireEnv("MODEL_NAME")
  };
}

function resolveMinTotalTokens(): number {
  const raw = process.env.MODEL_MIN_TOTAL_TOKENS?.trim();
  if (!raw) {
    return DEFAULT_MIN_TOKENS;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`MODEL_MIN_TOTAL_TOKENS must be a non-negative safe integer, received: ${raw}`);
  }

  return value;
}

function normalizeModelPath(basePathname: string): string {
  const trimmed = basePathname.trim();
  const base = !trimmed || trimmed === "/" ? "" : trimmed.replace(/\/+$/, "");
  if (base.endsWith(DEFAULT_COMPLETIONS_PATH)) {
    return base;
  }

  const path = `${base}${DEFAULT_COMPLETIONS_PATH}`;
  return path.startsWith("/") ? path : `/${path}`;
}

function resolveReclaimUseTee(): boolean {
  const raw = process.env.RECLAIM_USE_TEE?.trim().toLowerCase();
  if (!raw) {
    return false;
  }

  const enabled = raw === "1" || raw === "true" || raw === "yes";
  if (enabled && process.platform === "win32") {
    throw new Error("RECLAIM_USE_TEE=true is not supported on Windows by @reclaimprotocol/zk-fetch.");
  }

  return enabled;
}

async function ensureOwnerAccess(
  settlement: ReturnType<typeof FulfillPaySettlement__factory.connect>,
  verifierRegistry: ReturnType<typeof VerifierRegistry__factory.connect>,
  expectedOwner: string
) {
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

async function ensureVerifierAuthorized(
  verifierRegistry: ReturnType<typeof VerifierRegistry__factory.connect>,
  verifier: string
): Promise<string | null> {
  if (await verifierRegistry.isVerifier(verifier)) {
    return null;
  }

  const tx = await verifierRegistry.addVerifier(verifier);
  const receipt = await tx.wait();
  return getReceiptHash(receipt, "addVerifier");
}

async function deployAndAllowMockToken(
  settlement: ReturnType<typeof FulfillPaySettlement__factory.connect>,
  ownerWallet: Wallet,
  txs: TxRecord[]
) {
  const deployTx = await new MockERC20__factory(ownerWallet).deploy(
    "FulfillPay Reclaim Test USD",
    "fpRTUSD",
    ownerWallet.address,
    0n
  );
  await deployTx.waitForDeployment();
  const deploymentReceipt = await deployTx.deploymentTransaction()?.wait();
  if (deploymentReceipt) {
    txs.push({ label: "deploy mock token", hash: getReceiptHash(deploymentReceipt, "deployMockToken") });
  }

  const tokenAddress = await deployTx.getAddress();
  if (!(await settlement.allowedTokens(tokenAddress))) {
    const allowTx = await settlement.setAllowedToken(tokenAddress, true);
    const allowReceipt = await allowTx.wait();
    txs.push({ label: "allow mock token", hash: getReceiptHash(allowReceipt, "allowMockToken") });
  }

  return deployTx;
}

async function fundBuyerAndApprove(
  mockToken: ReturnType<typeof MockERC20__factory.connect>,
  buyerWallet: Wallet,
  settlementAddress: string,
  txs: TxRecord[]
) {
  const mintTx = await mockToken.mint(buyerWallet.address, DEFAULT_MINT_AMOUNT);
  const mintReceipt = await mintTx.wait();
  txs.push({ label: "mint buyer tokens", hash: getReceiptHash(mintReceipt, "mintBuyerTokens") });

  const approveTx = await mockToken.connect(buyerWallet).approve(settlementAddress, DEFAULT_MINT_AMOUNT);
  const approveReceipt = await approveTx.wait();
  txs.push({ label: "approve settlement", hash: getReceiptHash(approveReceipt, "approveSettlement") });
}

function buildCommitment(input: {
  taskId: Bytes32;
  buyer: string;
  seller: string;
  deadlineMs: bigint;
  verifier: string;
  host: string;
  path: string;
  model: string;
  minTotalTokens: number;
}): ExecutionCommitment {
  return {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: input.taskId,
    buyer: normalizeAddress(input.buyer, "buyer"),
    seller: normalizeAddress(input.seller, "seller"),
    target: {
      host: input.host,
      path: input.path,
      method: "POST"
    },
    allowedModels: [input.model],
    minUsage: {
      totalTokens: input.minTotalTokens
    },
    deadline: input.deadlineMs.toString(),
    verifier: normalizeAddress(input.verifier, "verifier")
  };
}

async function callVerifier(baseUrl: string, taskId: string): Promise<VerificationResult> {
  const response = await fetch(`${baseUrl}/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ taskId, markProofsConsumed: true })
  });

  const body = await response.json();
  if (response.status !== 200) {
    throw new Error(`Verifier returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return body as VerificationResult;
}

async function listenOnEphemeralPort(server: Server): Promise<string> {
  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Verifier server did not bind to a TCP address."));
        return;
      }

      resolve(address.port);
    });
  });

  return `http://127.0.0.1:${port}`;
}

async function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function expectTaskStatus(buyerSdk: BuyerSdk, taskId: string, expected: string) {
  const task = await buyerSdk.getTask(taskId);
  assert.equal(task.status, expected);
}

function getReceiptHash(
  receipt: { hash?: string | null; transactionHash?: string | null } | null | undefined,
  label: string
): string {
  const hash = receipt?.hash ?? receipt?.transactionHash;
  if (!hash) {
    throw new Error(`${label} did not produce a transaction hash.`);
  }

  return hash;
}

function pushPointer(records: UriRecord[], label: string, pointer: StoragePointer) {
  records.push({
    label,
    uri: pointer.uri,
    hash: pointer.hash
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
