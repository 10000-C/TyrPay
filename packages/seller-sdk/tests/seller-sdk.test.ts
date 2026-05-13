import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFileSync } from "node:fs";

import type { ExecutionCommitment, ProofBundle, DeliveryReceipt, Bytes32 } from "@tyrpay/sdk-core";
import { hashDeliveryReceipt, hashExecutionCommitment, hashProofBundle } from "@tyrpay/sdk-core";
import { MemoryStorageAdapter } from "@tyrpay/storage-adapter";
import { MockZkTlsAdapter } from "@tyrpay/zktls-adapter";

import { SellerAgent } from "../src/seller-agent.js";
import type { SellerConfig, ContractLike, Signer } from "../src/types.js";

// ── Fixture loading ──────────────────────────────────────────────

const __dirname = import.meta.dirname;

interface FixtureFile<T> {
  name: string;
  objectType: string;
  object: T;
  canonical: string;
  hash: string;
  notes?: string;
}

function loadFixture<T>(relativePath: string): FixtureFile<T> {
  // __dirname = packages/seller-sdk/.test-dist/tests → root = ../../../../
  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
  return JSON.parse(readFileSync(path.resolve(projectRoot, relativePath), "utf8")) as FixtureFile<T>;
}

const commitmentFixture = loadFixture<ExecutionCommitment>("test/fixtures/protocol/commitments/commitment.openai-compatible.json");
const proofBundleFixture = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");

// ── Test constants ───────────────────────────────────────────────

const SELLER_ADDRESS = "0x2222222222222222222222222222222222222222";
const SETTLEMENT_CONTRACT = "0x4444444444444444444444444444444444444444";
const CHAIN_ID = "31337";
const TASK_NONCE = "0x6666666666666666666666666666666666666666666666666666666666666666";
const COMMITMENT_URI = "ipfs://TyrPay/commitments/test";
const PROOF_BUNDLE_URI = "ipfs://TyrPay/proof-bundles/test";

// ── Mock implementations ────────────────────────────────────────

function createMockSigner(): Signer {
  return {
    async getAddress() {
      return SELLER_ADDRESS;
    },
    async signTransaction() {
      return "0xmocksignedtx";
    },
    async sendTransaction() {
      return {
        hash: "0xmocktxhash00000000000000000000000000000000000000000000000000000000",
        async wait() {}
      };
    }
  };
}

function createMockContract(): ContractLike {
  return {
    async submitCommitment() {
      return {
        hash: "0xmock_commitment_tx_hash00000000000000000000000000000000000000000",
        async wait() {}
      };
    },
    async submitProofBundle() {
      return {
        hash: "0xmock_proof_tx_hash000000000000000000000000000000000000000000000",
        async wait() {}
      };
    }
  };
}

function createSellerAgent(): SellerAgent {
  const config: SellerConfig = {
    signer: createMockSigner(),
    settlementContract: SETTLEMENT_CONTRACT,
    chainId: CHAIN_ID,
    storageAdapter: new MemoryStorageAdapter(),
    zkTlsAdapter: new MockZkTlsAdapter()
  };

  return new SellerAgent(config);
}

class CapturingMockZkTlsAdapter extends MockZkTlsAdapter {
  capturedInput: unknown;

  override async provenFetch(input: Parameters<MockZkTlsAdapter["provenFetch"]>[0]) {
    this.capturedInput = input;
    return super.provenFetch(input);
  }
}

// ── Tests ────────────────────────────────────────────────────────

test("SellerAgent constructor normalizes config fields", () => {
  const agent = createSellerAgent();

  assert.equal(agent.settlementContract, SETTLEMENT_CONTRACT);
  assert.equal(agent.chainId, CHAIN_ID);
  assert.ok(agent.storageAdapter);
  assert.ok(agent.zkTlsAdapter);
  assert.ok(agent.signer);
});

test("SellerAgent constructor rejects invalid settlement contract address", () => {
  assert.throws(
    () =>
      new SellerAgent({
        signer: createMockSigner(),
        settlementContract: "not-an-address" as unknown as `0x${string}`,
        chainId: CHAIN_ID,
        storageAdapter: new MemoryStorageAdapter(),
        zkTlsAdapter: new MockZkTlsAdapter()
      }),
    TypeError
  );
});

test("buildTaskContextFromCommitment builds a valid TaskContext", () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;
  const taskContext = agent.buildTaskContextFromCommitment(commitment, TASK_NONCE);

  assert.equal(taskContext.taskId, commitment.taskId);
  assert.equal(taskContext.buyer, commitment.buyer);
  assert.equal(taskContext.seller, commitment.seller);
  assert.equal(taskContext.chainId, CHAIN_ID);
  assert.equal(taskContext.settlementContract, SETTLEMENT_CONTRACT);
  assert.equal(taskContext.taskNonce, TASK_NONCE);
  assert.equal(taskContext.protocol, "TyrPay");
  assert.equal(taskContext.version, 1);
  assert.equal(taskContext.schemaVersion, "TyrPay.task-context.v1");
  assert.equal(
    taskContext.commitmentHash,
    commitmentFixture.hash,
    "commitmentHash should match the fixture hash of the ExecutionCommitment"
  );
});

// ── submitCommitment tests ───────────────────────────────────────

test("submitCommitment submits and returns correct result", async () => {
  const agent = createSellerAgent();
  const contract = createMockContract();
  const commitment = commitmentFixture.object;

  const result = await agent.submitCommitment(contract, commitment, COMMITMENT_URI);

  assert.equal(result.taskId, commitment.taskId);
  assert.equal(result.commitmentHash, commitmentFixture.hash);
  assert.equal(result.commitmentURI, COMMITMENT_URI);
  assert.equal(result.txHash, "0xmock_commitment_tx_hash00000000000000000000000000000000000000000");
});

test("submitCommitment rejects empty commitmentURI", async () => {
  const agent = createSellerAgent();
  const contract = createMockContract();
  const commitment = commitmentFixture.object;

  await assert.rejects(
    () => agent.submitCommitment(contract, commitment, ""),
    /commitmentURI must be a non-empty string/
  );
});

test("submitCommitment rejects invalid commitment", async () => {
  const agent = createSellerAgent();
  const contract = createMockContract();

  await assert.rejects(
    () =>
      agent.submitCommitment(contract, {} as ExecutionCommitment, COMMITMENT_URI),
    TypeError
  );
});

// ── provenFetch tests ────────────────────────────────────────────

test("provenFetch produces a valid DeliveryReceipt", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  const result = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  const receipt = result.receipt;

  assert.equal(receipt.schemaVersion, "TyrPay.delivery-receipt.v1");
  assert.equal(receipt.callIndex, 0);
  assert.equal(receipt.provider, "mock");
  assert.equal(receipt.taskContext.taskId, commitment.taskId);
  assert.equal(receipt.taskContext.seller, commitment.seller);
  assert.equal(receipt.taskContext.buyer, commitment.buyer);
  assert.equal(receipt.taskContext.chainId, CHAIN_ID);
  assert.equal(receipt.taskContext.settlementContract, SETTLEMENT_CONTRACT);
  assert.equal(receipt.extracted.model, "gpt-4o-mini");
  assert.ok(receipt.extracted.usage.totalTokens > 0);
  assert.ok(receipt.rawProofURI.length > 0);
  assert.ok(receipt.rawProofHash.startsWith("0x"));
  assert.ok(receipt.requestHash.startsWith("0x"));
  assert.ok(receipt.responseHash.startsWith("0x"));
  assert.ok(receipt.providerProofId.length > 0);
  assert.equal(result.receiptPointer.hash, hashDeliveryReceipt(receipt));
  assert.equal(result.receiptPointer.uri, `memory://storage/receipts/${result.receiptPointer.hash}.json`);
  assert.equal(result.rawProofPointer.uri, receipt.rawProofURI);
  assert.ok(result.rawProof);

  const restoredReceipt = await agent.storageAdapter.getObject<DeliveryReceipt>(result.receiptPointer);
  assert.deepEqual(restoredReceipt, receipt);
});

test("provenFetch passes providerOptions through to the zkTLS adapter", async () => {
  const adapter = new CapturingMockZkTlsAdapter();
  const agent = new SellerAgent({
    signer: createMockSigner(),
    settlementContract: SETTLEMENT_CONTRACT,
    chainId: CHAIN_ID,
    storageAdapter: new MemoryStorageAdapter(),
    zkTlsAdapter: adapter
  });
  const commitment = commitmentFixture.object;
  const providerOptions = {
    privateOptions: {
      headers: {
        authorization: "Bearer test"
      }
    },
    retries: 2,
    retryIntervalMs: 500,
    useTee: true
  };

  await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE,
    providerOptions
  });

  const capturedInput = adapter.capturedInput as Record<string, unknown>;
  assert.deepEqual(capturedInput.privateOptions, providerOptions.privateOptions);
  assert.equal(capturedInput.retries, providerOptions.retries);
  assert.equal(capturedInput.retryIntervalMs, providerOptions.retryIntervalMs);
  assert.equal(capturedInput.useTee, providerOptions.useTee);
  assert.equal(capturedInput.declaredModel, "gpt-4o-mini");
  assert.equal(capturedInput.callIndex, 0);
  assert.ok(capturedInput.taskContext);
  assert.ok(capturedInput.callIntentHash);
});

// ── buildDeliveryReceipt tests ───────────────────────────────────

test("buildDeliveryReceipt returns a valid DeliveryReceipt", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  const receipt = await agent.buildDeliveryReceipt({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  assert.equal(receipt.schemaVersion, "TyrPay.delivery-receipt.v1");
  assert.equal(receipt.callIndex, 0);
  assert.equal(receipt.extracted.model, "gpt-4o-mini");
});

// ── buildProofBundle tests ───────────────────────────────────────

test("buildProofBundle assembles a valid ProofBundle from receipts", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  // First get a receipt via provenFetch
  const { receipt } = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  // Build the proof bundle
  const bundle = agent.buildProofBundle({
    commitment,
    receipts: [receipt],
    createdAt: "1735686600000"
  });

  assert.equal(bundle.schemaVersion, "TyrPay.proof-bundle.v1");
  assert.equal(bundle.taskId, commitment.taskId);
  assert.equal(bundle.seller, commitment.seller);
  assert.equal(bundle.receipts.length, 1);
  assert.equal(bundle.receipts[0], receipt);
  assert.equal(bundle.aggregateUsage.totalTokens, receipt.extracted.usage.totalTokens);
  assert.equal(bundle.createdAt, "1735686600000");
  assert.equal(bundle.commitmentHash, commitmentFixture.hash);
});

test("buildProofBundle rejects empty receipts array", () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  assert.throws(
    () => agent.buildProofBundle({ commitment, receipts: [], createdAt: "1735686600000" }),
    /receipts must be a non-empty array/
  );
});

test("buildProofBundle defaults createdAt to current time", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  const { receipt } = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  const before = Date.now();
  const bundle = agent.buildProofBundle({ commitment, receipts: [receipt] });
  const after = Date.now();

  const createdAt = Number(bundle.createdAt);
  assert.ok(createdAt >= before && createdAt <= after, "createdAt should be near current time");
});

// ── uploadProofBundle tests ──────────────────────────────────────

test("uploadProofBundle uploads and returns storage pointer with verified hash", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  const { receipt } = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  const bundle = agent.buildProofBundle({
    commitment,
    receipts: [receipt],
    createdAt: "1735686600000"
  });

  const uploadResult = await agent.uploadProofBundle(bundle);

  assert.ok(uploadResult.pointer.uri.length > 0);
  assert.equal(uploadResult.pointer.hash, hashProofBundle(bundle));
  assert.deepEqual(uploadResult.bundle, bundle);
});

test("uploadProofBundle rejects invalid ProofBundle", async () => {
  const agent = createSellerAgent();

  await assert.rejects(
    () => agent.uploadProofBundle({} as ProofBundle),
    TypeError
  );
});

// ── submitProofBundleHash tests ──────────────────────────────────

test("submitProofBundleHash submits and returns correct result", async () => {
  const agent = createSellerAgent();
  const contract = createMockContract();

  const taskId = "0x5555555555555555555555555555555555555555555555555555555555555555" as Bytes32;
  const proofBundleHash = "0xcb24838e336e57d8398dc543b2fa406471f724b26321ab4f3cce4814891de3d7" as Bytes32;

  const result = await agent.submitProofBundleHash(contract, taskId, proofBundleHash, PROOF_BUNDLE_URI);

  assert.equal(result.taskId, taskId);
  assert.equal(result.proofBundleHash, proofBundleHash);
  assert.equal(result.proofBundleURI, PROOF_BUNDLE_URI);
  assert.equal(result.txHash, "0xmock_proof_tx_hash000000000000000000000000000000000000000000000");
});

test("submitProofBundleHash rejects empty proofBundleURI", async () => {
  const agent = createSellerAgent();
  const contract = createMockContract();

  await assert.rejects(
    () =>
      agent.submitProofBundleHash(
        contract,
        "0x5555555555555555555555555555555555555555555555555555555555555555" as Bytes32,
        "0xcb24838e336e57d8398dc543b2fa406471f724b26321ab4f3cce4814891de3d7" as Bytes32,
        ""
      ),
    /proofBundleURI must be a non-empty string/
  );
});

test("submitProofBundleHash rejects invalid taskId", async () => {
  const agent = createSellerAgent();
  const contract = createMockContract();

  await assert.rejects(
    () =>
      agent.submitProofBundleHash(
        contract,
        "not-bytes32" as Bytes32,
        "0xcb24838e336e57d8398dc543b2fa406471f724b26321ab4f3cce4814891de3d7" as Bytes32,
        PROOF_BUNDLE_URI
      ),
    TypeError
  );
});

// ── End-to-end seller flow tests ─────────────────────────────────

test("full seller flow: commitment → provenFetch → buildProofBundle → upload → submitProofBundleHash", async () => {
  const agent = createSellerAgent();
  const contract = createMockContract();
  const commitment = commitmentFixture.object;

  // Step 1: Submit commitment
  const commitmentResult = await agent.submitCommitment(contract, commitment, COMMITMENT_URI);
  assert.equal(commitmentResult.commitmentHash, commitmentFixture.hash);
  assert.equal(commitmentResult.taskId, commitment.taskId);

  // Step 2: Perform proven fetch
  const { receipt, rawProof } = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  assert.equal(receipt.extracted.model, "gpt-4o-mini");
  assert.ok(rawProof);

  // Step 3: Build proof bundle
  const bundle = agent.buildProofBundle({
    commitment,
    receipts: [receipt],
    createdAt: "1735686600000"
  });

  assert.equal(bundle.taskId, commitment.taskId);
  assert.equal(bundle.seller, commitment.seller);
  assert.equal(bundle.commitmentHash, commitmentFixture.hash);

  // Step 4: Upload proof bundle
  const uploadResult = await agent.uploadProofBundle(bundle);
  assert.equal(uploadResult.pointer.hash, hashProofBundle(bundle));

  // Step 5: Submit proof bundle hash on-chain
  const proofResult = await agent.submitProofBundleHash(
    contract,
    bundle.taskId,
    uploadResult.pointer.hash,
    uploadResult.pointer.uri
  );

  assert.equal(proofResult.taskId, bundle.taskId);
  assert.equal(proofResult.proofBundleHash, uploadResult.pointer.hash);
  assert.equal(proofResult.proofBundleURI, uploadResult.pointer.uri);
});

test("full seller flow with multiple calls builds multi-receipt ProofBundle", async () => {
  const agent = createSellerAgent();
  const contract = createMockContract();
  const commitment = commitmentFixture.object;

  // Submit commitment
  await agent.submitCommitment(contract, commitment, COMMITMENT_URI);

  // First call
  const result1 = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  // Second call
  const result2 = await agent.provenFetch({
    commitment,
    callIndex: 1,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  // Build bundle with multiple receipts
  const bundle = agent.buildProofBundle({
    commitment,
    receipts: [result1.receipt, result2.receipt],
    createdAt: "1735686600000"
  });

  assert.equal(bundle.receipts.length, 2);
  assert.equal(bundle.receipts[0].callIndex, 0);
  assert.equal(bundle.receipts[1].callIndex, 1);
  assert.equal(
    bundle.aggregateUsage.totalTokens,
    result1.receipt.extracted.usage.totalTokens + result2.receipt.extracted.usage.totalTokens
  );

  // Upload and verify
  const uploadResult = await agent.uploadProofBundle(bundle);
  assert.equal(uploadResult.pointer.hash, hashProofBundle(bundle));

  // Submit
  const proofResult = await agent.submitProofBundleHash(
    contract,
    bundle.taskId,
    uploadResult.pointer.hash,
    uploadResult.pointer.uri
  );

  assert.ok(proofResult.txHash);
});

// ── Edge case and error tests ────────────────────────────────────

test("provenFetch rejects invalid commitment", async () => {
  const agent = createSellerAgent();

  await assert.rejects(
    () =>
      agent.provenFetch({
        commitment: {} as ExecutionCommitment,
        callIndex: 0,
        request: { host: "api.openai.com", path: "/v1/chat/completions", method: "POST" },
        declaredModel: "gpt-4o-mini",
        taskNonce: TASK_NONCE
      }),
    TypeError
  );
});

test("buildProofBundle rejects receipt with mismatched taskId", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  const { receipt } = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  // Tamper with the receipt's taskId
  const tamperedReceipt = {
    ...receipt,
    taskContext: {
      ...receipt.taskContext,
      taskId: "0x0000000000000000000000000000000000000000000000000000000000000001" as Bytes32
    }
  };

  assert.throws(
    () => agent.buildProofBundle({ commitment, receipts: [tamperedReceipt], createdAt: "1735686600000" }),
    /taskContext.taskId must match commitment.taskId/
  );
});

test("buildProofBundle validates aggregateUsage matches sum of receipt tokens", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  const { receipt } = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  // The assertProofBundle at the end of buildProofBundle validates the sum
  // Our implementation correctly computes aggregateUsage, so this should pass
  const bundle = agent.buildProofBundle({ commitment, receipts: [receipt] });
  assert.equal(bundle.aggregateUsage.totalTokens, receipt.extracted.usage.totalTokens);
});

test("provenFetch with mock scenario produces correct receipt", async () => {
  const mockAdapter = new MockZkTlsAdapter();
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  const result = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  // Default mock scenario is "pass" - should have matching model and sufficient tokens
  assert.equal(result.receipt.extracted.model, "gpt-4o-mini");
  assert.ok(result.receipt.extracted.usage.totalTokens >= 1);
});

// ── Endpoint and model validation tests ───────────────────────────

test("provenFetch rejects request with mismatched host", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  await assert.rejects(
    () =>
      agent.provenFetch({
        commitment,
        callIndex: 0,
        request: { host: "wrong.api.com", path: "/v1/chat/completions", method: "POST" },
        declaredModel: "gpt-4o-mini",
        taskNonce: TASK_NONCE
      }),
    /request.host.*does not match commitment.target.host/
  );
});

test("provenFetch rejects request with mismatched path", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  await assert.rejects(
    () =>
      agent.provenFetch({
        commitment,
        callIndex: 0,
        request: { host: "api.openai.com", path: "/v1/wrong", method: "POST" },
        declaredModel: "gpt-4o-mini",
        taskNonce: TASK_NONCE
      }),
    /request.path.*does not match commitment.target.path/
  );
});

test("provenFetch rejects request with mismatched method", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  await assert.rejects(
    () =>
      agent.provenFetch({
        commitment,
        callIndex: 0,
        request: { host: "api.openai.com", path: "/v1/chat/completions", method: "GET" },
        declaredModel: "gpt-4o-mini",
        taskNonce: TASK_NONCE
      }),
    /request.method.*does not match commitment.target.method/
  );
});

test("provenFetch rejects declaredModel not in allowedModels", async () => {
  const agent = createSellerAgent();
  const commitment = commitmentFixture.object;

  await assert.rejects(
    () =>
      agent.provenFetch({
        commitment,
        callIndex: 0,
        request: { host: "api.openai.com", path: "/v1/chat/completions", method: "POST" },
        declaredModel: "gpt-3.5-turbo",
        taskNonce: TASK_NONCE
      }),
    /declaredModel.*is not in commitment.allowedModels/
  );
});

// ── Multi-provider selection tests ───────────────────────────────

test("provenFetch uses named provider from zkTlsAdapters when provider is specified", async () => {
  const defaultAdapter = new MockZkTlsAdapter();
  const namedAdapter = new CapturingMockZkTlsAdapter();

  const agent = new SellerAgent({
    signer: createMockSigner(),
    settlementContract: SETTLEMENT_CONTRACT,
    chainId: CHAIN_ID,
    storageAdapter: new MemoryStorageAdapter(),
    zkTlsAdapter: defaultAdapter,
    zkTlsAdapters: {
      "mock-named": namedAdapter
    }
  });

  const commitment = commitmentFixture.object;
  const result = await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: { host: "api.openai.com", path: "/v1/chat/completions", method: "POST" },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE,
    provider: "mock-named"
  });

  assert.equal(result.receipt.provider, "mock");
  assert.ok(namedAdapter.capturedInput, "named adapter should have received the call");
});

test("provenFetch falls back to default adapter when provider is omitted", async () => {
  const defaultAdapter = new CapturingMockZkTlsAdapter();
  const namedAdapter = new CapturingMockZkTlsAdapter();

  const agent = new SellerAgent({
    signer: createMockSigner(),
    settlementContract: SETTLEMENT_CONTRACT,
    chainId: CHAIN_ID,
    storageAdapter: new MemoryStorageAdapter(),
    zkTlsAdapter: defaultAdapter,
    zkTlsAdapters: {
      "mock-named": namedAdapter
    }
  });

  const commitment = commitmentFixture.object;
  await agent.provenFetch({
    commitment,
    callIndex: 0,
    request: { host: "api.openai.com", path: "/v1/chat/completions", method: "POST" },
    declaredModel: "gpt-4o-mini",
    taskNonce: TASK_NONCE
  });

  assert.ok(defaultAdapter.capturedInput, "default adapter should have received the call");
  assert.equal(namedAdapter.capturedInput, undefined, "named adapter should NOT have been called");
});

test("provenFetch rejects unknown provider name", async () => {
  const agent = new SellerAgent({
    signer: createMockSigner(),
    settlementContract: SETTLEMENT_CONTRACT,
    chainId: CHAIN_ID,
    storageAdapter: new MemoryStorageAdapter(),
    zkTlsAdapter: new MockZkTlsAdapter(),
    zkTlsAdapters: {
      "mock-a": new MockZkTlsAdapter()
    }
  });

  const commitment = commitmentFixture.object;
  await assert.rejects(
    () =>
      agent.provenFetch({
        commitment,
        callIndex: 0,
        request: { host: "api.openai.com", path: "/v1/chat/completions", method: "POST" },
        declaredModel: "gpt-4o-mini",
        taskNonce: TASK_NONCE,
        provider: "nonexistent"
      }),
    /Unknown zkTLS provider "nonexistent"/
  );
});
