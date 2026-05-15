import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  buildCallIntentHash,
  hashExecutionCommitment,
  hashObject,
  hashProofBundle,
  hashVerificationReport,
  normalizeAddress,
  type Address,
  type Bytes32,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type ProofBundle,
  type TaskStatus,
  type UIntLike,
  type URI,
  type UnixMillis
} from "@tyrpay/sdk-core";
import { MemoryStorageAdapter, type StoragePointer } from "@tyrpay/storage-adapter";
import { BuyerSdk } from "@tyrpay/buyer-sdk";
import { SellerAgent } from "@tyrpay/seller-sdk";
import {
  MockZkTlsAdapter,
  type MockScenario,
  type MockTimeWindow
} from "@tyrpay/zktls-adapter";

import {
  TyrPaySettlement,
  TyrPaySettlement__factory,
  MockERC20,
  MockERC20__factory,
  VerifierRegistry,
  VerifierRegistry__factory
} from "../../../packages/contracts/typechain-types";

export { type MockScenario, type MockTimeWindow };

export const GRACE_PERIOD_MS = 15n * 60n * 1000n;
export const VERIFICATION_TIMEOUT_MS = 60n * 60n * 1000n;
export const DEFAULT_AMOUNT = 1_000_000n;
export const INITIAL_BALANCE = 10_000_000n;
export const DEFAULT_TOKENS = 128;

export interface E2eEnvironment {
  owner: HardhatEthersSigner;
  buyer: HardhatEthersSigner;
  seller: HardhatEthersSigner;
  verifier: HardhatEthersSigner;
  stranger: HardhatEthersSigner;

  verifierRegistry: VerifierRegistry;
  settlement: TyrPaySettlement;
  settlementAddress: Address;
  mockToken: MockERC20;
  chainId: bigint;

  buyerSdk: BuyerSdk;
  sellerAgent: SellerAgent;
  storage: MemoryStorageAdapter;
  zkTlsAdapter: MockZkTlsAdapter;
}

export async function deployE2eFixture(): Promise<E2eEnvironment> {
  const [owner, buyer, seller, verifier, stranger] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  // Deploy contracts
  const verifierRegistry = await new VerifierRegistry__factory(owner).deploy(owner.address);
  await verifierRegistry.waitForDeployment();
  await (await verifierRegistry.addVerifier(verifier.address)).wait();

  const verifierRegistryAddress = await ethers.resolveAddress(verifierRegistry);
  const settlement = await new TyrPaySettlement__factory(owner).deploy(
    verifierRegistryAddress,
    GRACE_PERIOD_MS,
    VERIFICATION_TIMEOUT_MS
  );
  await settlement.waitForDeployment();
  const settlementAddress = await ethers.resolveAddress(settlement) as Address;

  const mockToken = await new MockERC20__factory(owner).deploy(
    "TyrPay Mock USD",
    "fpUSD",
    owner.address,
    0
  );
  await mockToken.waitForDeployment();
  await (await settlement.setAllowedToken(await ethers.resolveAddress(mockToken), true)).wait();
  await (await mockToken.mint(buyer.address, INITIAL_BALANCE)).wait();
  await (await mockToken.connect(buyer).approve(settlementAddress, INITIAL_BALANCE)).wait();

  // Shared adapters
  const storage = new MemoryStorageAdapter();
  const zkTlsAdapter = new MockZkTlsAdapter();

  // SDK instances
  const buyerSdk = new BuyerSdk({
    settlementAddress,
    signer: buyer,
    storage
  });

  const sellerAgent = new SellerAgent({
    signer: seller,
    settlementContract: settlementAddress,
    chainId: chainId.toString(),
    storageAdapter: storage,
    zkTlsAdapter
  });

  return {
    owner, buyer, seller, verifier, stranger,
    verifierRegistry, settlement, settlementAddress, mockToken, chainId,
    buyerSdk, sellerAgent, storage, zkTlsAdapter
  };
}

/**
 * Build a standard ExecutionCommitment for testing.
 */
export function buildTestCommitment(input: {
  taskId: Bytes32;
  buyer: string;
  seller: string;
  deadlineMs: bigint;
  verifier: string;
  overrides?: Partial<ExecutionCommitment>;
}): ExecutionCommitment {
  return {
    schemaVersion: SCHEMA_VERSIONS.executionCommitment,
    taskId: input.taskId,
    buyer: input.buyer.toLowerCase() as Address,
    seller: input.seller.toLowerCase() as Address,
    target: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    allowedModels: ["gpt-4.1-mini"],
    minUsage: {
      totalTokens: 100
    },
    deadline: input.deadlineMs.toString() as UnixMillis,
    verifier: input.verifier.toLowerCase() as Address,
    ...input.overrides
  };
}

/**
 * Submit commitment on-chain: store in storage + submit to contract.
 */
export async function submitCommitmentOnChain(input: {
  env: E2eEnvironment;
  taskId: Bytes32;
  commitment: ExecutionCommitment;
}): Promise<{ commitmentHash: Bytes32; commitmentURI: URI }> {
  const { env, taskId, commitment } = input;
  const pointer = await env.storage.putObject(commitment, { namespace: "commitments" });

  const contract = await ethers.getContractAt(
    "TyrPaySettlement",
    env.settlementAddress
  );
  await (await contract.connect(env.seller).submitCommitment(taskId, pointer.hash, pointer.uri)).wait();

  return { commitmentHash: pointer.hash as Bytes32, commitmentURI: pointer.uri };
}

// ─── Seller proof building blocks ────────────────────────────────────────────

/**
 * Compute the callIntentHash for a given call.
 * Mirrors seller-agent.ts computeCallIntentHash (which is private there).
 */
function computeCallIntentHash(
  taskContext: import("@tyrpay/sdk-core").TaskContext,
  callIndex: number,
  request: { host: string; path: string; method: string; body?: unknown },
  declaredModel: string
): Bytes32 {
  const requestBodyHash = request.body !== undefined
    ? hashObject(request.body)
    : hashObject("");

  return buildCallIntentHash({
    taskContext,
    callIndex,
    host: request.host,
    path: request.path,
    method: request.method.toUpperCase(),
    declaredModel,
    requestBodyHash
  });
}

export interface SellerFetchInput {
  env: E2eEnvironment;
  commitment: ExecutionCommitment;
  taskNonce: Bytes32;
  /** 0 by default */
  callIndex?: number;
  /** MockZkTlsAdapter scenario. Defaults to "pass". */
  scenario?: MockScenario;
  /** Override totalTokens returned by adapter */
  totalTokens?: number;
  /** Required for usage_insufficient scenario: the commitment's minUsage.totalTokens */
  commitmentMinTokens?: number;
  /** Required for timestamp_before_funded / timestamp_after_deadline scenarios */
  timeWindow?: MockTimeWindow;
  /** Override the request body (useful for producing receipts with different callIntentHash) */
  requestBodyOverride?: unknown;
}

export interface SellerFetchOutput {
  receipt: DeliveryReceipt;
  receiptPointer: StoragePointer;
  rawProof: unknown;
  rawProofPointer: StoragePointer;
}

/**
 * Perform a single proven fetch via MockZkTlsAdapter, returning a DeliveryReceipt.
 * Uses the current EVM block time as observedAt (ensuring withinTaskWindow = true
 * for pass/model_mismatch/usage_insufficient scenarios).
 */
export async function sellerProvenFetch(input: SellerFetchInput): Promise<SellerFetchOutput> {
  const { env, commitment, taskNonce } = input;
  const callIndex = input.callIndex ?? 0;
  const scenario = input.scenario ?? "pass";

  const taskContext = env.sellerAgent.buildTaskContextFromCommitment(
    commitment,
    taskNonce
  );

  const requestBody = input.requestBodyOverride ?? {
    model: commitment.allowedModels[0],
    messages: [{ role: "user", content: "test" }]
  };

  const request = {
    host: commitment.target.host,
    path: commitment.target.path,
    method: commitment.target.method,
    body: requestBody
  };

  const callIntentHash = computeCallIntentHash(
    taskContext,
    callIndex,
    request,
    commitment.allowedModels[0]
  );

  // For pass / model_mismatch / usage_insufficient: use current EVM block time as
  // observedAt so the receipt falls within [fundedAt, deadline].
  // For timestamp_* scenarios: the adapter computes observedAt from timeWindow.
  const needsExplicitObservedAt =
    scenario === "pass" ||
    scenario === "model_mismatch" ||
    scenario === "usage_insufficient";

  const observedAt: UIntLike | undefined = needsExplicitObservedAt
    ? await currentTimeMs()
    : undefined;

  const provenFetchResult = await env.zkTlsAdapter.provenFetch({
    taskContext,
    callIndex,
    callIntentHash,
    request,
    declaredModel: commitment.allowedModels[0],
    scenario,
    totalTokens: input.totalTokens,
    commitmentMinTokens: input.commitmentMinTokens,
    timeWindow: input.timeWindow,
    observedAt
  });

  // Upload raw proof to storage (verifier needs to fetch it)
  const rawProofPointer = await env.storage.putObject(provenFetchResult.rawProof, {
    namespace: "raw-proofs"
  });

  // Normalize into a DeliveryReceipt
  const receipt = await env.zkTlsAdapter.normalizeReceipt(provenFetchResult.rawProof, {
    taskContext,
    callIndex,
    callIntentHash,
    rawProofURI: rawProofPointer.uri
  });
  const receiptPointer = await env.storage.putObject(receipt, { namespace: "receipts" });

  return {
    receipt,
    receiptPointer,
    rawProof: provenFetchResult.rawProof,
    rawProofPointer
  };
}

export interface SellerProofOutput {
  proofBundle: ProofBundle;
  proofBundleHash: Bytes32;
  proofBundleURI: URI;
}

/**
 * Build and upload a proof bundle from one or more receipts.
 * Does NOT submit the hash on-chain — call sellerSubmitProof for that.
 */
export async function sellerBuildAndUploadProof(input: {
  env: E2eEnvironment;
  commitment: ExecutionCommitment;
  receipts: DeliveryReceipt[];
}): Promise<SellerProofOutput> {
  const { env, commitment, receipts } = input;

  const proofBundle = env.sellerAgent.buildProofBundle({ commitment, receipts });
  const uploadResult = await env.sellerAgent.uploadProofBundle(proofBundle);

  return {
    proofBundle,
    proofBundleHash: uploadResult.pointer.hash as Bytes32,
    proofBundleURI: uploadResult.pointer.uri
  };
}

/**
 * Submit a proof bundle hash on-chain (FUNDED → PROOF_SUBMITTED).
 */
export async function sellerSubmitProof(input: {
  env: E2eEnvironment;
  commitment: ExecutionCommitment;
  proofBundleHash: Bytes32;
  proofBundleURI: URI;
}): Promise<void> {
  const { env, commitment, proofBundleHash, proofBundleURI } = input;
  const contract = (await ethers.getContractAt(
    "TyrPaySettlement",
    env.settlementAddress
  )).connect(env.seller);

  await env.sellerAgent.submitProofBundleHash(
    contract,
    commitment.taskId,
    proofBundleHash,
    proofBundleURI
  );
}

/**
 * Run the full Seller flow for a single-receipt proof bundle:
 *   provenFetch → buildProofBundle → upload → submitProofBundleHash
 */
export async function sellerFullFlow(input: SellerFetchInput): Promise<SellerProofOutput> {
  const fetchOutput = await sellerProvenFetch(input);

  const proofOutput = await sellerBuildAndUploadProof({
    env: input.env,
    commitment: input.commitment,
    receipts: [fetchOutput.receipt]
  });

  await sellerSubmitProof({
    env: input.env,
    commitment: input.commitment,
    proofBundleHash: proofOutput.proofBundleHash,
    proofBundleURI: proofOutput.proofBundleURI
  });

  return proofOutput;
}

/**
 * Sign a VerificationReport using EIP-712 typed data for the settlement contract.
 */
export async function signVerificationReport(input: {
  verifier: HardhatEthersSigner;
  settlementAddress: Address;
  chainId: bigint;
  report: {
    taskId: string;
    buyer: string;
    seller: string;
    commitmentHash: string;
    proofBundleHash: string;
    passed: boolean;
    settlementAction: number;
    settlementAmount: bigint;
    verifiedAt: bigint;
    reportHash: string;
  };
}): Promise<string> {
  return input.verifier.signTypedData(
    {
      name: "TyrPay",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.settlementAddress
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
    input.report
  );
}

/**
 * Build a correctly computed reportHash and return a signed settle report.
 */
export async function buildAndSignReport(input: {
  env: E2eEnvironment;
  taskId: string;
  commitmentHash: string;
  proofBundleHash: string;
  passed: boolean;
  totalTokens?: number;
}): Promise<{
  report: {
    taskId: string;
    buyer: string;
    seller: string;
    commitmentHash: string;
    proofBundleHash: string;
    passed: boolean;
    settlementAction: number;
    settlementAmount: bigint;
    verifiedAt: bigint;
    reportHash: string;
  };
  signature: string;
}> {
  const { env } = input;
  const verifiedAt = BigInt(await env.settlement.currentTimeMs());
  const settlementAction = input.passed ? 1 : 2;

  const reportHash = hashVerificationReport({
    schemaVersion: SCHEMA_VERSIONS.verificationReport,
    chainId: env.chainId.toString(),
    settlementContract: env.settlementAddress.toLowerCase(),
    taskId: input.taskId as Bytes32,
    buyer: env.buyer.address.toLowerCase() as Bytes32,
    seller: env.seller.address.toLowerCase() as Bytes32,
    commitmentHash: input.commitmentHash,
    proofBundleHash: input.proofBundleHash,
    passed: input.passed,
    checks: {
      commitmentHashMatched: true,
      proofBundleHashMatched: true,
      zkTlsProofValid: true,
      endpointMatched: true,
      taskContextMatched: true,
      callIndicesUnique: true,
      proofNotConsumed: true,
      withinTaskWindow: true,
      modelMatched: input.passed,
      usageSatisfied: input.passed
    },
    aggregateUsage: { totalTokens: input.totalTokens ?? DEFAULT_TOKENS },
    settlement: {
      action: input.passed ? "RELEASE" as const : "REFUND" as const,
      amount: DEFAULT_AMOUNT.toString()
    },
    verifier: env.verifier.address.toLowerCase() as Bytes32,
    verifiedAt: verifiedAt.toString()
  });

  const report = {
    taskId: input.taskId,
    buyer: env.buyer.address,
    seller: env.seller.address,
    commitmentHash: input.commitmentHash,
    proofBundleHash: input.proofBundleHash,
    passed: input.passed,
    settlementAction,
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

  return { report, signature };
}

/**
 * Get current chain time in milliseconds.
 */
export async function currentTimeMs(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("Failed to get latest block");
  return BigInt(block.timestamp) * 1000n;
}

/**
 * Increase EVM time by seconds.
 */
export async function increaseTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/**
 * Increase EVM time to a specific timestamp (seconds).
 */
export async function increaseTimeTo(timestampSeconds: number): Promise<void> {
  await ethers.provider.send("evm_mine", [timestampSeconds]);
}
