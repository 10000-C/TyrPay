import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

import { Contract, ContractFactory, JsonRpcProvider, Wallet, formatEther } from "ethers";

import { SCHEMA_VERSIONS, normalizeAddress, normalizeBytes32, type Address, type Bytes32, type ExecutionCommitment, type UnixMillis } from "@tyrpay/sdk-core";
import { BuyerSdk } from "@tyrpay/buyer-sdk";
import { SellerAgent } from "@tyrpay/seller-sdk";
import { MemoryStorageAdapter } from "@tyrpay/storage-adapter";
import { MockZkTlsAdapter, ZeroGTeeTlsAdapter } from "@tyrpay/zktls-adapter";
import {
  CentralizedVerifier,
  EthersSettlementTaskReader,
  InMemoryProofConsumptionRegistry,
  createVerifierHttpServer,
  type VerificationResult
} from "@tyrpay/verifier-service";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env manually
try {
  const envContent = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env file is optional if env vars are set externally
}

// ── Config ──────────────────────────────────────────────────────

const RPC_URL = required("ZERO_G_EVM_RPC");
const CHAIN_ID = process.env.CHAIN_ID ?? "16602";
const SETTLEMENT_ADDRESS = required("SETTLEMENT_CONTRACT");
const BUYER_KEY = required("BUYER_PRIVATE_KEY");
const SELLER_KEY = required("SELLER_PRIVATE_KEY");
const VERIFIER_KEY = required("VERIFIER_PRIVATE_KEY");
const COMPUTE_KEY = required("ZERO_G_COMPUTE_PRIVATE_KEY");
const DEPLOYER_KEY = process.env.CONTRACT_OWNER_PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim() || BUYER_KEY;

const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

const SETTLEMENT_ABI = [
  "event TaskIntentCreated(bytes32 indexed taskId, bytes32 indexed taskNonce, address indexed buyer, address seller, address token, uint256 amount, uint256 deadlineMs, bytes32 metadataHash, string metadataURI)",
  "function createTaskIntent(address seller,address token,uint256 amount,uint256 deadlineMs,bytes32 metadataHash,string metadataURI) returns (bytes32 taskId, bytes32 taskNonce)",
  "function submitCommitment(bytes32 taskId, bytes32 commitmentHash, string calldata commitmentURI)",
  "function fundTask(bytes32 taskId)",
  "function submitProofBundle(bytes32 taskId, bytes32 proofBundleHash, string calldata proofBundleURI)",
  "function getTask(bytes32 taskId) view returns ((bytes32 taskId, bytes32 taskNonce, address buyer, address seller, address token, uint256 amount, uint256 deadlineMs, bytes32 commitmentHash, string commitmentURI, uint256 fundedAtMs, bytes32 proofBundleHash, string proofBundleURI, uint256 proofSubmittedAtMs, bytes32 reportHash, uint256 settledAtMs, uint256 refundedAtMs, uint8 status))",
  "function currentTimeMs() view returns (uint256)",
  "function proofSubmissionGracePeriodMs() view returns (uint256)",
  "function verificationTimeoutMs() view returns (uint256)",
  "function setAllowedToken(address token, bool allowed)",
  "function verifierRegistry() view returns (address)"
] as const;

const MOCK_TOKEN_ABI = [
  "function mint(address account, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)"
] as const;

const DEFAULT_AMOUNT = 1_000_000n;
const INITIAL_BALANCE = 10_000_000n;

// ── Main ────────────────────────────────────────────────────────

main().catch((error) => {
  console.error("[multi-provider-test] FAILED");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  console.log("[multi-provider-test] Connecting to 0G testnet...");

  const provider = new JsonRpcProvider(RPC_URL);
  const buyerWallet = new Wallet(normalizePrivateKey(BUYER_KEY), provider);
  const sellerWallet = new Wallet(normalizePrivateKey(SELLER_KEY), provider);
  const verifierWallet = new Wallet(normalizePrivateKey(VERIFIER_KEY), provider);
  const computeWallet = new Wallet(normalizePrivateKey(COMPUTE_KEY), provider);

  const network = await provider.getNetwork();
  console.log(`[multi-provider-test] Chain ${network.chainId}, buyer=${buyerWallet.address}, seller=${sellerWallet.address}, verifier=${verifierWallet.address}`);

  const chainId = network.chainId.toString();
  const settlementAddress = normalizeAddress(SETTLEMENT_ADDRESS, "settlementAddress");
  const deployerWallet = new Wallet(normalizePrivateKey(DEPLOYER_KEY), provider);

  // ── Deploy MockERC20 and configure allowed token ────────────

  console.log("[multi-provider-test] Deploying MockERC20...");
  const mockTokenAddress = await deployMockToken(deployerWallet, buyerWallet.address, settlementAddress);
  console.log(`[multi-provider-test] MockERC20 deployed at ${mockTokenAddress}`);

  // ── Resolve 0G TeeTLS endpoint ──────────────────────────────

  console.log("[multi-provider-test] Resolving 0G TeeTLS provider...");
  const { broker, serviceMetadata, resolvedEndpoint, resolvedModel } = await resolveZeroGProvider(computeWallet);

  console.log(`[multi-provider-test] 0G TeeTLS: endpoint=${resolvedEndpoint}, model=${resolvedModel}`);

  // ── Build adapters ──────────────────────────────────────────

  const storage = new MemoryStorageAdapter();
  const mockAdapter = new MockZkTlsAdapter();

  const zeroGAdapter = new ZeroGTeeTlsAdapter({
    signer: computeWallet,
    brokerFactory: () => broker,
    providerSelection: {
      enabled: true,
      fallbackOnUnreachable: true
    },
    fetchImpl: globalThis.fetch
  });

  // ── Build SellerAgent with multi-provider ───────────────────

  const sellerAgent = new SellerAgent({
    signer: sellerWallet,
    settlementContract: settlementAddress,
    chainId,
    storageAdapter: storage,
    zkTlsAdapter: mockAdapter,
    zkTlsAdapters: {
      mock: mockAdapter,
      "0g-teetls": zeroGAdapter
    }
  });

  // ── Build BuyerSdk ──────────────────────────────────────────

  const buyerSdk = new BuyerSdk({
    settlementAddress,
    signer: buyerWallet,
    storage
  });

  // ── Start verifier service ──────────────────────────────────

  console.log("[multi-provider-test] Starting verifier service...");

  const consumptionRegistry = new InMemoryProofConsumptionRegistry();
  const settlementReader = new EthersSettlementTaskReader({
    settlementAddress,
    runner: verifierWallet,
    chainId
  });

  const verifierService = new CentralizedVerifier({
    settlement: settlementReader,
    storage,
    signer: verifierWallet,
    zktlsAdapters: [mockAdapter, zeroGAdapter],
    consumptionRegistry,
    clock: () => Date.now()
  });

  const httpServer = createVerifierHttpServer({ verifier: verifierService });
  const verifierPort = await listenAsync(httpServer, 0);
  const verifierBaseUrl = `http://127.0.0.1:${verifierPort}`;
  console.log(`[multi-provider-test] Verifier listening on ${verifierBaseUrl}`);

  // ── Run test paths ──────────────────────────────────────────

  const results: Record<string, unknown> = {};

  try {
    // ── Path A: 0G TeeTLS ─────────────────────────────────────
    console.log("\n[multi-provider-test] === Path A: 0G TeeTLS ===");

    const teetlsResult = await runTeeTlsPath({
      provider, buyerWallet, sellerWallet, verifierWallet, settlementAddress,
      buyerSdk, sellerAgent, storage, verifierBaseUrl,
      endpoint: resolvedEndpoint,
      model: resolvedModel,
      tokenAddress: mockTokenAddress
    });

    results.teetls = teetlsResult;
    console.log(`[multi-provider-test] TeeTLS result: provider=${teetlsResult.provider}, tokens=${teetlsResult.totalTokens}, verifierPassed=${teetlsResult.verifierPassed}`);

    // ── Path B: Mock zkTLS ────────────────────────────────────
    console.log("\n[multi-provider-test] === Path B: Mock zkTLS ===");

    const mockResult = await runMockPath({
      provider, buyerWallet, sellerWallet, verifierWallet, settlementAddress,
      buyerSdk, sellerAgent, storage, verifierBaseUrl,
      tokenAddress: mockTokenAddress
    });

    results.mock = mockResult;
    console.log(`[multi-provider-test] Mock result: provider=${mockResult.provider}, tokens=${mockResult.totalTokens}, verifierPassed=${mockResult.verifierPassed}`);
  } finally {
    await closeAsync(httpServer);
  }

  // ── Report ──────────────────────────────────────────────────

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.resolve(__dirname, `../../reports/multi-provider-test-${timestamp}.json`);

  const report = {
    reportType: "TyrPay Multi-Provider Integration Test",
    generatedAt: new Date().toISOString(),
    chainId,
    settlementContract: settlementAddress,
    teetlsEndpoint: resolvedEndpoint,
    teetlsModel: resolvedModel,
    results
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[multi-provider-test] Report saved to ${reportPath}`);

  const allPassed = (results.teetls as Record<string, unknown>).verifierPassed === true
    && (results.mock as Record<string, unknown>).verifierPassed === true;

  if (allPassed) {
    console.log("[multi-provider-test] ALL PASSED");
  } else {
    console.error("[multi-provider-test] SOME TESTS FAILED — check report");
    process.exitCode = 1;
  }
}

// ── Path A: 0G TeeTLS ──────────────────────────────────────────

async function runTeeTlsPath(input: {
  provider: JsonRpcProvider;
  buyerWallet: Wallet;
  sellerWallet: Wallet;
  verifierWallet: Wallet;
  settlementAddress: Address;
  buyerSdk: BuyerSdk;
  sellerAgent: SellerAgent;
  storage: MemoryStorageAdapter;
  verifierBaseUrl: string;
  endpoint: string;
  model: string;
  tokenAddress: string;
}): Promise<{ provider: string; totalTokens: number; verifierPassed: boolean; verifierChecks: Record<string, boolean> }> {
  const { provider, buyerWallet, sellerWallet, verifierWallet, settlementAddress, buyerSdk, sellerAgent, storage, verifierBaseUrl, endpoint, model, tokenAddress } = input;

  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  const path = endpointUrl.pathname;

  // 1. Buyer creates task intent
  const currentTime = await getChainTimeMs(provider);
  const deadline = currentTime + 60n * 60n * 1000n;

  console.log("[teetls] Creating task intent...");
  const created = await buyerSdk.createTaskIntent({
    seller: sellerWallet.address,
    token: tokenAddress,
    amount: DEFAULT_AMOUNT,
    deadline,
    metadataURI: "tyrpay://multi-provider-test/teetls"
  });

  const taskId = created.taskId;
  const taskNonce = created.taskNonce;
  console.log(`[teetls] Task created: ${taskId.slice(0, 18)}...`);

  // 2. Seller submits commitment (0G TeeTLS endpoint)
  const commitment: ExecutionCommitment = {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: taskId as Bytes32,
    buyer: buyerWallet.address.toLowerCase() as Address,
    seller: sellerWallet.address.toLowerCase() as Address,
    target: { host, path, method: "POST" },
    allowedModels: [model],
    minUsage: { totalTokens: 1 },
    deadline: deadline.toString() as UnixMillis,
    verifier: verifierWallet.address.toLowerCase() as Address
  };

  console.log("[teetls] Submitting commitment...");
  const commitmentPointer = await storage.putObject(commitment, { namespace: "commitments" });
  const sellerContract = new Contract(settlementAddress, SETTLEMENT_ABI, sellerWallet);
  await (await sellerContract.submitCommitment(taskId, commitmentPointer.hash, commitmentPointer.uri)).wait();

  // 3. Buyer funds task
  console.log("[teetls] Funding task...");
  await buyerSdk.fundTask(taskId);

  // 4. Seller executes with TeeTLS provider
  console.log("[teetls] Running provenFetch with provider='0g-teetls'...");
  const provenResult = await sellerAgent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host,
      path,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        model,
        messages: [{ role: "user", content: "Say hello in one short sentence." }]
      }
    },
    declaredModel: model,
    taskNonce: taskNonce as Bytes32,
    provider: "0g-teetls"
  });

  const rawProof = provenResult.rawProof as Record<string, unknown>;
  const zeroG = rawProof.zeroG as Record<string, unknown>;
  const extracted = rawProof.extracted as { model: string; usage: { totalTokens: number } };

  console.log(`[teetls] Proof generated: provider=${rawProof.provider}, processResponseResult=${zeroG.processResponseResult}, tokens=${extracted.usage.totalTokens}`);
  console.log(`[teetls] providerProofId=${rawProof.providerProofId}, chatId=${zeroG.chatId ?? "n/a"}`);

  // 5. Build and submit proof bundle
  console.log("[teetls] Building proof bundle...");
  const proofBundle = sellerAgent.buildProofBundle({ commitment, receipts: [provenResult.receipt] });
  const uploadResult = await sellerAgent.uploadProofBundle(proofBundle);

  await sellerAgent.submitProofBundleHash(
    sellerContract,
    taskId as Bytes32,
    uploadResult.pointer.hash as Bytes32,
    uploadResult.pointer.uri
  );
  console.log("[teetls] Proof submitted on-chain");

  // 6. Verifier verifies
  console.log("[teetls] Calling verifier service...");
  const verifyResult = await callVerifierHttp(verifierBaseUrl, taskId);

  console.log(`[teetls] Verifier: passed=${verifyResult.report.passed}, action=${verifyResult.report.settlement.action}`);
  console.log(`[teetls] Checks: ${JSON.stringify(verifyResult.checks)}`);

  return {
    provider: provenResult.receipt.provider,
    totalTokens: extracted.usage.totalTokens,
    verifierPassed: verifyResult.report.passed,
    verifierChecks: verifyResult.checks
  };
}

// ── Path B: Mock zkTLS ─────────────────────────────────────────

async function runMockPath(input: {
  provider: JsonRpcProvider;
  buyerWallet: Wallet;
  sellerWallet: Wallet;
  verifierWallet: Wallet;
  settlementAddress: Address;
  buyerSdk: BuyerSdk;
  sellerAgent: SellerAgent;
  storage: MemoryStorageAdapter;
  verifierBaseUrl: string;
  tokenAddress: string;
}): Promise<{ provider: string; totalTokens: number; verifierPassed: boolean; verifierChecks: Record<string, boolean> }> {
  const { provider, buyerWallet, sellerWallet, verifierWallet, settlementAddress, buyerSdk, sellerAgent, storage, verifierBaseUrl, tokenAddress } = input;

  // 1. Buyer creates task intent
  const currentTime = await getChainTimeMs(provider);
  const deadline = currentTime + 60n * 60n * 1000n;

  console.log("[mock] Creating task intent...");
  const created = await buyerSdk.createTaskIntent({
    seller: sellerWallet.address,
    token: tokenAddress,
    amount: DEFAULT_AMOUNT,
    deadline,
    metadataURI: "tyrpay://multi-provider-test/mock"
  });

  const taskId = created.taskId;
  const taskNonce = created.taskNonce;
  console.log(`[mock] Task created: ${taskId.slice(0, 18)}...`);

  // 2. Seller submits commitment (mock endpoint)
  const commitment: ExecutionCommitment = {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: taskId as Bytes32,
    buyer: buyerWallet.address.toLowerCase() as Address,
    seller: sellerWallet.address.toLowerCase() as Address,
    target: { host: "api.openai.com", path: "/v1/chat/completions", method: "POST" },
    allowedModels: ["gpt-4.1-mini"],
    minUsage: { totalTokens: 1 },
    deadline: deadline.toString() as UnixMillis,
    verifier: verifierWallet.address.toLowerCase() as Address
  };

  console.log("[mock] Submitting commitment...");
  const commitmentPointer = await storage.putObject(commitment, { namespace: "commitments" });
  const sellerContract = new Contract(settlementAddress, SETTLEMENT_ABI, sellerWallet);
  await (await sellerContract.submitCommitment(taskId, commitmentPointer.hash, commitmentPointer.uri)).wait();

  // 3. Buyer funds task
  console.log("[mock] Funding task...");
  await buyerSdk.fundTask(taskId);

  // 4. Seller executes with Mock provider
  //    Use chain time as observedAt so the verifier's withinTaskWindow check
  //    aligns with the on-chain fundedAt timestamp.
  const chainTimeAfterFund = await getChainTimeMs(provider);

  console.log("[mock] Running provenFetch with provider='mock'...");
  const provenResult = await sellerAgent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      body: {
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: "test" }]
      }
    },
    declaredModel: "gpt-4.1-mini",
    taskNonce: taskNonce as Bytes32,
    provider: "mock",
    providerOptions: { observedAt: chainTimeAfterFund }
  });

  const extracted = provenResult.receipt.extracted;
  console.log(`[mock] Proof generated: provider=${provenResult.receipt.provider}, tokens=${extracted.usage.totalTokens}`);

  // 5. Build and submit proof bundle
  console.log("[mock] Building proof bundle...");
  const proofBundle = sellerAgent.buildProofBundle({ commitment, receipts: [provenResult.receipt] });
  const uploadResult = await sellerAgent.uploadProofBundle(proofBundle);

  await sellerAgent.submitProofBundleHash(
    sellerContract,
    taskId as Bytes32,
    uploadResult.pointer.hash as Bytes32,
    uploadResult.pointer.uri
  );
  console.log("[mock] Proof submitted on-chain");

  // 6. Verifier verifies
  console.log("[mock] Calling verifier service...");
  const verifyResult = await callVerifierHttp(verifierBaseUrl, taskId);

  console.log(`[mock] Verifier: passed=${verifyResult.report.passed}, action=${verifyResult.report.settlement.action}`);
  console.log(`[mock] Checks: ${JSON.stringify(verifyResult.checks)}`);

  return {
    provider: provenResult.receipt.provider,
    totalTokens: extracted.usage.totalTokens,
    verifierPassed: verifyResult.report.passed,
    verifierChecks: verifyResult.checks
  };
}

// ── Helpers ─────────────────────────────────────────────────────

async function deployMockToken(deployer: Wallet, buyerAddress: string, settlementAddress: string): Promise<string> {
  const artifactPath = path.resolve(__dirname, "../../packages/contracts/artifacts/contracts/MockERC20.sol/MockERC20.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const token = await factory.deploy("TyrPay Test USD", "fpUSD", deployer.address, INITIAL_BALANCE);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  // Mint to buyer
  await (await token.mint(buyerAddress, INITIAL_BALANCE)).wait();

  // Buyer approves settlement contract
  const buyerWallet = new Wallet(normalizePrivateKey(BUYER_KEY), deployer.provider!);
  const tokenByBuyer = new Contract(tokenAddress, MOCK_TOKEN_ABI, buyerWallet);
  await (await tokenByBuyer.approve(settlementAddress, INITIAL_BALANCE * 2n)).wait();

  // Add to settlement allowed tokens
  const settlement = new Contract(settlementAddress, SETTLEMENT_ABI, deployer);
  await (await settlement.setAllowedToken(tokenAddress, true)).wait();

  return tokenAddress;
}

async function resolveZeroGProvider(wallet: Wallet): Promise<{
  broker: unknown;
  serviceMetadata: { endpoint: string; model: string };
  resolvedEndpoint: string;
  resolvedModel: string;
}> {
  const require = createRequire(import.meta.url);
  const module = require("@0gfoundation/0g-compute-ts-sdk") as Record<string, unknown>;
  const createBroker = module.createZGComputeNetworkBroker;
  if (typeof createBroker !== "function") {
    throw new Error("0G SDK does not export createZGComputeNetworkBroker");
  }
  const broker = await (createBroker as (signer: unknown) => Promise<unknown>)(wallet);

  // Try listService first to find a reachable provider
  let selectedProviderAddress: string | undefined;

  if (typeof (broker as any).inference.listService === "function") {
    const services = await (broker as any).inference.listService();

    for (const service of Array.isArray(services) ? services : []) {
      const s = service as Record<string, unknown>;
      const st = s.serviceType ?? s.type;
      const ver = s.verifiability ?? s.verificationMode ?? s.teeType;

      if (typeof st === "string" && st === "chatbot" && typeof ver === "string" && ver.toLowerCase().includes("tee")) {
        selectedProviderAddress = (s.provider ?? s.providerAddress ?? s.address) as string;
        break;
      }
    }
  }

  if (!selectedProviderAddress) {
    selectedProviderAddress = process.env.ZERO_G_PROVIDER_ADDRESS ?? "0x69Eb5a0BD7d0f4bF39eD5CE9Bd3376c61863aE08";
  }

  const metadata = await (broker as any).inference.getServiceMetadata(selectedProviderAddress) as { endpoint: string; model: string };

  const basePath = process.env.ZERO_G_OPENAI_PATH?.trim() || "/chat/completions";
  const base = metadata.endpoint.endsWith("/") ? metadata.endpoint.slice(0, -1) : metadata.endpoint;
  const suffix = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const resolvedEndpoint = `${base}${suffix}`;

  return { broker, serviceMetadata: metadata, resolvedEndpoint, resolvedModel: metadata.model };
}

async function callVerifierHttp(baseUrl: string, taskId: string): Promise<VerificationResult> {
  const response = await fetch(`${baseUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, markProofsConsumed: true })
  });

  const body = await response.json();

  if (response.status !== 200) {
    throw new Error(`Verifier returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return body as VerificationResult;
}

async function getChainTimeMs(provider: JsonRpcProvider): Promise<bigint> {
  const block = await provider.getBlock("latest");
  if (!block) throw new Error("Failed to get latest block");
  return BigInt(block.timestamp) * 1000n;
}


function listenAsync(server: ReturnType<typeof import("node:http").createServer>, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr !== null ? addr.port : 0);
    });
    server.on("error", reject);
  });
}

function closeAsync(server: ReturnType<typeof import("node:http").createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.startsWith("0x") ? value : `0x${value}`;
}
