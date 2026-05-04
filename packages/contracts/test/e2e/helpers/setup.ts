import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";

import {
  SCHEMA_VERSIONS,
  hashExecutionCommitment,
  hashProofBundle,
  normalizeAddress,
  type Address,
  type Bytes32,
  type ExecutionCommitment,
  type ProofBundle,
  type TaskStatus,
  type UIntLike,
  type URI,
  type UnixMillis
} from "@fulfillpay/sdk-core";
import { MemoryStorageAdapter } from "@fulfillpay/storage-adapter";
import { BuyerSdk } from "@fulfillpay/buyer-sdk";
import { SellerAgent } from "@fulfillpay/seller-sdk";
import { MockZkTlsAdapter } from "@fulfillpay/zktls-adapter";

import {
  FulfillPaySettlement,
  FulfillPaySettlement__factory,
  MockERC20,
  MockERC20__factory,
  VerifierRegistry,
  VerifierRegistry__factory
} from "../../../typechain-types";

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
  settlement: FulfillPaySettlement;
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
  const settlement = await new FulfillPaySettlement__factory(owner).deploy(
    verifierRegistryAddress,
    GRACE_PERIOD_MS,
    VERIFICATION_TIMEOUT_MS
  );
  await settlement.waitForDeployment();
  const settlementAddress = await ethers.resolveAddress(settlement) as Address;

  const mockToken = await new MockERC20__factory(owner).deploy(
    "FulfillPay Mock USD",
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
    "FulfillPaySettlement",
    env.settlementAddress
  );
  await (await contract.connect(env.seller).submitCommitment(taskId, pointer.hash, pointer.uri)).wait();

  return { commitmentHash: pointer.hash as Bytes32, commitmentURI: pointer.uri };
}

/**
 * Run the full Seller flow: provenFetch → buildProofBundle → upload → submitProofBundleHash.
 */
export async function sellerFullFlow(input: {
  env: E2eEnvironment;
  commitment: ExecutionCommitment;
  taskNonce: Bytes32;
  scenario?: "pass" | "model_mismatch" | "usage_insufficient";
  totalTokens?: number;
  commitmentMinTokens?: number;
}): Promise<{ proofBundle: ProofBundle; proofBundleHash: Bytes32; proofBundleURI: URI }> {
  const { env, commitment, taskNonce } = input;
  const contract = (await ethers.getContractAt(
    "FulfillPaySettlement",
    env.settlementAddress
  )).connect(env.seller);

  // provenFetch via SellerAgent
  const provenFetchResult = await env.sellerAgent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: commitment.target.host,
      path: commitment.target.path,
      method: commitment.target.method,
      body: { model: "gpt-4.1-mini", messages: [{ role: "user", content: "test" }] }
    },
    declaredModel: "gpt-4.1-mini",
    taskNonce
  });

  // Build proof bundle
  const proofBundle = env.sellerAgent.buildProofBundle({
    commitment,
    receipts: [provenFetchResult.receipt]
  });

  // Upload to storage
  const uploadResult = await env.sellerAgent.uploadProofBundle(proofBundle);

  // Submit on-chain
  await env.sellerAgent.submitProofBundleHash(
    contract,
    commitment.taskId,
    uploadResult.pointer.hash as Bytes32,
    uploadResult.pointer.uri
  );

  return {
    proofBundle,
    proofBundleHash: uploadResult.pointer.hash as Bytes32,
    proofBundleURI: uploadResult.pointer.uri
  };
}

/**
 * Sign a VerificationReport using the EIP-712 typed data for the settlement contract.
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
      name: "FulfillPay",
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
 * Helper to get current chain time in milliseconds.
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
 * Increase EVM time to a specific timestamp.
 */
export async function increaseTimeTo(timestampSeconds: number): Promise<void> {
  await ethers.provider.send("evm_mine", [timestampSeconds]);
}