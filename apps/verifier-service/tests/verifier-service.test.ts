import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCallIntentHash,
  buildVerificationReportTypedData,
  hashExecutionCommitment,
  hashObject,
  type Address,
  type Bytes32,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type ProofBundle
} from "@fulfillpay/sdk-core";
import { MemoryStorageAdapter } from "@fulfillpay/storage-adapter";
import { MockZkTlsAdapter, type MockScenario } from "@fulfillpay/zktls-adapter";
import { Wallet, verifyTypedData } from "ethers";

import {
  CentralizedVerifier,
  InMemoryProofConsumptionRegistry,
  REQUIRED_VERIFICATION_CHECKS,
  toSettlementReportStruct,
  type OnChainTask,
  type ProofConsumptionRegistry,
  type SettlementTaskReader
} from "../src/index.js";

const CHAIN_ID = "31337";
const SETTLEMENT_CONTRACT = "0x4444444444444444444444444444444444444444";
const TASK_ID = "0x5555555555555555555555555555555555555555555555555555555555555555";
const TASK_NONCE = "0x6666666666666666666666666666666666666666666666666666666666666666";
const WRONG_TASK_NONCE = "0x7777777777777777777777777777777777777777777777777777777777777777";
const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const FUNDED_AT = "1735680000000";
const DEADLINE = "1735689600000";
const VERIFIED_AT = "1735686900000";
const PRIVATE_KEY = "0x1000000000000000000000000000000000000000000000000000000000000001";

interface BuildFixtureOptions {
  scenario?: MockScenario;
  totalTokens?: number;
  observedAt?: string;
  mutateReceipt?: (receipt: DeliveryReceipt) => DeliveryReceipt;
  consumptionRegistry?: ProofConsumptionRegistry;
}

class MockSettlementReader implements SettlementTaskReader {
  proofBundleConsumed = false;

  constructor(private readonly task: OnChainTask) {}

  async getTask(taskId: Bytes32): Promise<OnChainTask> {
    assert.equal(taskId, this.task.taskId);
    return this.task;
  }

  async getChainId(): Promise<string> {
    return CHAIN_ID;
  }

  async getSettlementContractAddress(): Promise<string> {
    return SETTLEMENT_CONTRACT;
  }

  async isProofBundleConsumed(proofBundleHash: Bytes32): Promise<boolean> {
    assert.equal(proofBundleHash, this.task.proofBundleHash);
    return this.proofBundleConsumed;
  }
}

test("signs a passing verification report for contract settlement", async () => {
  const fixture = await buildFixture();
  const result = await fixture.verifier.verifyTask(fixture.task.taskId);

  assert.equal(result.report.passed, true);
  assert.equal(result.report.settlement.action, "RELEASE");
  for (const check of REQUIRED_VERIFICATION_CHECKS) {
    assert.equal(result.checks[check], true, check);
  }

  const typedData = buildVerificationReportTypedData(result.report);
  const recovered = verifyTypedData(
    typedData.domain,
    typedData.types,
    typedData.message,
    result.report.signature
  ).toLowerCase();
  assert.equal(recovered, fixture.verifierWallet.address.toLowerCase());

  const settlementReport = toSettlementReportStruct(result.report);
  assert.equal(settlementReport.settlementAction, 1);
  assert.equal(settlementReport.settlementAmount, BigInt(fixture.task.amount));
  assert.equal(settlementReport.reportHash, result.report.reportHash);
});

test("fails when the observed model is outside the commitment", async () => {
  const fixture = await buildFixture({ scenario: "model_mismatch" });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.report.settlement.action, "REFUND");
  assert.equal(result.checks.modelMatched, false);
  assert.equal(result.checks.usageSatisfied, true);
  assert.equal(result.checks.zkTlsProofValid, true);
});

test("fails when aggregate usage is below the committed minimum", async () => {
  const fixture = await buildFixture({ scenario: "usage_insufficient" });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.usageSatisfied, false);
  assert.equal(result.aggregateUsage.totalTokens, 119);
  assert.equal(result.report.settlement.action, "REFUND");
});

test("fails when the proof timestamp is outside the task window", async () => {
  const fixture = await buildFixture({ scenario: "timestamp_after_deadline" });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.withinTaskWindow, false);
  assert.equal(result.checks.modelMatched, true);
});

test("fails when receipt context differs from the on-chain task", async () => {
  const fixture = await buildFixture({
    mutateReceipt: (receipt) => ({
      ...receipt,
      taskContext: {
        ...receipt.taskContext,
        taskNonce: WRONG_TASK_NONCE
      }
    })
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.taskContextMatched, false);
  assert.equal(result.checks.zkTlsProofValid, true);
});

test("rejects verifier-side proof replay after a report is produced", async () => {
  const consumptionRegistry = new InMemoryProofConsumptionRegistry();
  const fixture = await buildFixture({ consumptionRegistry });

  const first = await fixture.verifier.verifyTask(fixture.task.taskId);
  assert.equal(first.report.passed, true);

  const second = await fixture.verifier.verifyTask(fixture.task.taskId);
  assert.equal(second.report.passed, false);
  assert.equal(second.checks.proofNotConsumed, false);
  assert.equal(second.report.settlement.action, "REFUND");
});

async function buildFixture(options: BuildFixtureOptions = {}) {
  const storage = new MemoryStorageAdapter();
  const mockZkTlsAdapter = new MockZkTlsAdapter();
  const verifierWallet = new Wallet(PRIVATE_KEY);
  const verifierAddress = verifierWallet.address.toLowerCase() as Address;
  const commitment: ExecutionCommitment = {
    schemaVersion: "fulfillpay.execution-commitment.v1",
    taskId: TASK_ID,
    buyer: BUYER,
    seller: SELLER,
    target: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST"
    },
    allowedModels: ["gpt-4o-mini"],
    minUsage: {
      totalTokens: 120
    },
    deadline: DEADLINE,
    verifier: verifierAddress
  };
  const commitmentHash = hashExecutionCommitment(commitment);
  const commitmentPointer = await storage.putObject(commitment, { namespace: "commitments" });
  assert.equal(commitmentPointer.hash, commitmentHash);

  const taskContext = {
    schemaVersion: "fulfillpay.task-context.v1",
    protocol: "FulfillPay",
    version: 1,
    chainId: CHAIN_ID,
    settlementContract: SETTLEMENT_CONTRACT,
    taskId: TASK_ID,
    taskNonce: TASK_NONCE,
    commitmentHash,
    buyer: BUYER,
    seller: SELLER
  } as const;
  const requestBody = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "prove this call" }]
  };
  const callIntentHash = buildCallIntentHash({
    taskContext,
    callIndex: 0,
    host: commitment.target.host,
    path: commitment.target.path,
    method: commitment.target.method,
    declaredModel: "gpt-4o-mini",
    requestBodyHash: hashObject(requestBody)
  });
  const provenFetchInput = {
    taskContext,
    callIndex: 0,
    callIntentHash,
    request: {
      host: commitment.target.host,
      path: commitment.target.path,
      method: commitment.target.method,
      body: requestBody
    },
    declaredModel: "gpt-4o-mini",
    scenario: options.scenario ?? "pass",
    totalTokens: options.totalTokens ?? 128,
    commitmentMinTokens: commitment.minUsage.totalTokens,
    timeWindow: {
      fundedAt: FUNDED_AT,
      deadline: DEADLINE
    },
    ...(options.observedAt !== undefined ? { observedAt: options.observedAt } : {})
  } as const;
  const { rawProof } = await mockZkTlsAdapter.provenFetch(provenFetchInput);
  const rawProofPointer = await storage.putObject(rawProof, { namespace: "raw-proofs" });
  const baseReceipt = await mockZkTlsAdapter.normalizeReceipt(rawProof, {
    taskContext,
    callIndex: 0,
    callIntentHash,
    rawProofURI: rawProofPointer.uri
  });
  const receipt = options.mutateReceipt ? options.mutateReceipt(baseReceipt) : baseReceipt;
  const proofBundle: ProofBundle = {
    schemaVersion: "fulfillpay.proof-bundle.v1",
    taskId: TASK_ID,
    commitmentHash,
    seller: SELLER,
    receipts: [receipt],
    aggregateUsage: {
      totalTokens: receipt.extracted.usage.totalTokens
    },
    createdAt: "1735686600000"
  };
  const proofBundlePointer = await storage.putObject(proofBundle, { namespace: "proof-bundles" });
  const task: OnChainTask = {
    taskId: TASK_ID,
    taskNonce: TASK_NONCE,
    buyer: BUYER,
    seller: SELLER,
    token: TOKEN,
    amount: "1000000",
    deadline: DEADLINE,
    commitmentHash,
    commitmentURI: commitmentPointer.uri,
    fundedAt: FUNDED_AT,
    proofBundleHash: proofBundlePointer.hash,
    proofBundleURI: proofBundlePointer.uri,
    proofSubmittedAt: "1735686700000",
    status: "PROOF_SUBMITTED"
  };
  const settlement = new MockSettlementReader(task);
  const verifier = new CentralizedVerifier({
    settlement,
    storage,
    signer: verifierWallet,
    zktlsAdapters: [mockZkTlsAdapter],
    consumptionRegistry: options.consumptionRegistry,
    clock: () => VERIFIED_AT
  });

  return {
    verifier,
    verifierWallet,
    task,
    settlement,
    storage,
    commitment,
    proofBundle,
    rawProof
  };
}
