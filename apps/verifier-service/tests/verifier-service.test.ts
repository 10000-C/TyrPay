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
  buildProofConsumptionKeys,
  CentralizedVerifier,
  InMemoryProofConsumptionRegistry,
  PrismaProofConsumptionRegistry,
  REQUIRED_VERIFICATION_CHECKS,
  VerifierInputIntegrityError,
  VerifierInputUnavailableError,
  createVerifierHttpServer,
  signVerificationReport,
  toSettlementReportStruct,
  type OnChainTask,
  type ProofConsumptionRegistry,
  type PrismaProofConsumptionKeyCreateInput,
  type PrismaProofConsumptionRegistryClient,
  type SettlementTaskReader
} from "../src/index.js";

const CHAIN_ID = "31337";
const SETTLEMENT_CONTRACT = "0x4444444444444444444444444444444444444444";
const TASK_ID = "0x5555555555555555555555555555555555555555555555555555555555555555";
const TASK_NONCE = "0x6666666666666666666666666666666666666666666666666666666666666666";
const WRONG_TASK_NONCE = "0x7777777777777777777777777777777777777777777777777777777777777777";
const OTHER_TASK_ID = "0x8888888888888888888888888888888888888888888888888888888888888888" as Bytes32;
const OTHER_PROOF_BUNDLE_HASH =
  "0x9999999999999999999999999999999999999999999999999999999999999999" as Bytes32;
const WRONG_COMMITMENT_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Bytes32;
const WRONG_CALL_INTENT_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Bytes32;
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
  commitmentVerifier?: Address;
  verifierAddress?: string;
  verifierAuthorized?: boolean;
  proofSubmittedAt?: string;
  proofSubmissionGracePeriod?: string;
  verificationTimeout?: string;
  taskCommitmentHash?: Bytes32;
  callIntentHash?: Bytes32;
  proofBundleConsumed?: boolean;
}

class MockSettlementReader implements SettlementTaskReader {
  proofBundleConsumed = false;

  constructor(
    private readonly task: OnChainTask,
    private readonly verifierAuthorized = true,
    private readonly proofSubmissionGracePeriod = "600000",
    private readonly verificationTimeout = "600000"
  ) {}

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

  async isVerifierAuthorized(_verifier: Address): Promise<boolean> {
    return this.verifierAuthorized;
  }

  async getProofSubmissionGracePeriod(): Promise<string> {
    return this.proofSubmissionGracePeriod;
  }

  async getVerificationTimeout(): Promise<string> {
    return this.verificationTimeout;
  }
}

class FakeProofConsumptionKeyDelegate {
  readonly records: PrismaProofConsumptionKeyCreateInput[] = [];

  async findFirst(args: {
    where: { OR: Array<{ keyType: PrismaProofConsumptionKeyCreateInput["keyType"]; key: string }> };
    select?: Record<string, boolean>;
  }): Promise<PrismaProofConsumptionKeyCreateInput | null> {
    return (
      this.records.find((record) =>
        args.where.OR.some((candidate) => candidate.keyType === record.keyType && candidate.key === record.key)
      ) ?? null
    );
  }

  async createMany(args: { data: PrismaProofConsumptionKeyCreateInput[] }): Promise<{ count: number }> {
    for (const next of args.data) {
      if (this.records.some((record) => record.keyType === next.keyType && record.key === next.key)) {
        throw new Error("Unique constraint failed on proof consumption key.");
      }
    }

    this.records.push(...args.data);
    return { count: args.data.length };
  }
}

class FakePrismaClient implements PrismaProofConsumptionRegistryClient {
  readonly proofConsumptionKey = new FakeProofConsumptionKeyDelegate();
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
  assert.equal(result.reportPointer.hash, hashObject(result.report));

  const restoredReport = await fixture.storage.getObject(result.reportPointer);
  assert.deepEqual(restoredReport, result.report);
});

test("rejects signing reports whose passed flag does not match required checks", async () => {
  const fixture = await buildFixture();
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });
  const { signature: _signature, reportHash: _reportHash, ...unsignedReport } = result.report;

  await assert.rejects(
    () =>
      signVerificationReport(
        {
          ...unsignedReport,
          checks: {
            ...unsignedReport.checks,
            modelMatched: false
          },
          passed: true
        },
        fixture.verifierWallet
      ),
    /passed must equal the AND/
  );
});

test("rejects signing reports missing required checks", async () => {
  const fixture = await buildFixture();
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });
  const { signature: _signature, reportHash: _reportHash, ...unsignedReport } = result.report;
  const checks: Record<string, boolean> = { ...unsignedReport.checks };

  delete checks.modelMatched;

  await assert.rejects(
    () =>
      signVerificationReport(
        {
          ...unsignedReport,
          checks
        },
        fixture.verifierWallet
      ),
    /checks.modelMatched is required/
  );
});

test("fails when the observed model is outside the commitment", async () => {
  const fixture = await buildFixture({ scenario: "model_mismatch" });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.report.settlement.action, "REFUND");
  assert.equal(result.checks.modelMatched, false);
  assert.equal(result.checks.usageSatisfied, false);
  assert.equal(result.checks.zkTlsProofValid, true);
  assert.equal(result.aggregateUsage.totalTokens, 0);
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
  assert.equal(result.checks.usageSatisfied, false);
  assert.equal(result.aggregateUsage.totalTokens, 0);
});

test("allows proof submitted after deadline when receipts were observed before deadline", async () => {
  const fixture = await buildFixture({
    proofSubmittedAt: "1735689900000",
    proofSubmissionGracePeriod: "600000"
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, true);
  assert.equal(result.checks.withinTaskWindow, true);
  assert.equal(result.report.settlement.action, "RELEASE");
});

test("fails late proof submitted within grace when receipt was observed after deadline", async () => {
  const fixture = await buildFixture({
    scenario: "timestamp_after_deadline",
    proofSubmittedAt: "1735689900000",
    proofSubmissionGracePeriod: "600000"
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.withinTaskWindow, false);
  assert.equal(result.checks.zkTlsProofValid, true);
  assert.equal(result.checks.usageSatisfied, false);
  assert.equal(result.aggregateUsage.totalTokens, 0);
  assert.equal(result.report.settlement.action, "REFUND");
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
  assert.equal(result.checks.usageSatisfied, false);
  assert.equal(result.aggregateUsage.totalTokens, 0);
});

test("fails when call intent hash does not match the proven request semantics", async () => {
  const fixture = await buildFixture({ callIntentHash: WRONG_CALL_INTENT_HASH });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.taskContextMatched, false);
  assert.equal(result.checks.zkTlsProofValid, true);
  assert.equal(result.checks.endpointMatched, true);
  assert.equal(result.checks.modelMatched, true);
  assert.equal(result.checks.usageSatisfied, false);
  assert.equal(result.aggregateUsage.totalTokens, 0);
});

test("rejects verifier-side proof replay after a report is produced", async () => {
  const consumptionRegistry = new InMemoryProofConsumptionRegistry();
  const fixture = await buildFixture({ consumptionRegistry });

  const first = await fixture.verifier.verifyTask(fixture.task.taskId);
  assert.equal(first.report.passed, true);

  await assert.rejects(() => fixture.verifier.verifyTask(fixture.task.taskId), /already reserved/);
});

test("rejects proof replay when a consumption key belongs to another task", async () => {
  const consumptionRegistry = new InMemoryProofConsumptionRegistry();
  const fixture = await buildFixture({ consumptionRegistry });
  const keys = buildProofConsumptionKeys(fixture.proofBundle);

  await consumptionRegistry.markConsumed(keys, {
    taskId: OTHER_TASK_ID,
    proofBundleHash: OTHER_PROOF_BUNDLE_HASH,
    reportHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Bytes32,
    passed: true,
    verifiedAt: VERIFIED_AT
  });

  await assert.rejects(() => fixture.verifier.verifyTask(fixture.task.taskId), /already reserved by task/);
});

test("does not consume replay keys from proofs that fail verification", async () => {
  const consumptionRegistry = new InMemoryProofConsumptionRegistry();
  const fixture = await buildFixture({
    consumptionRegistry,
    mutateReceipt: (receipt) => ({
      ...receipt,
      responseHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    })
  });
  const keys = buildProofConsumptionKeys(fixture.proofBundle);
  const result = await fixture.verifier.verifyTask(fixture.task.taskId);

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.zkTlsProofValid, false);
  assert.equal(result.consumed, false);
  assert.equal(await consumptionRegistry.hasAny(keys), false);
});

test("rejects report generation when the proof bundle was already consumed on-chain", async () => {
  const fixture = await buildFixture({ proofBundleConsumed: true });

  await assert.rejects(
    () => fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false }),
    /already consumed by the settlement contract/
  );
});

test("serves verification reports over the HTTP API", async () => {
  const fixture = await buildFixture();
  const server = createVerifierHttpServer({ verifier: fixture.verifier });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new TypeError("Expected verifier HTTP server to listen on a TCP address.");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        taskId: fixture.task.taskId,
        markProofsConsumed: false
      })
    });
    const body = (await response.json()) as { report: { passed: boolean }; reportPointer: { uri: string }; consumed: boolean };

    assert.equal(response.status, 200);
    assert.equal(body.report.passed, true);
    assert.match(body.reportPointer.uri, /^memory:\/\/storage\/verification-reports\//);
    assert.equal(body.consumed, false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("fails when receipt usage is inflated beyond the raw proof extraction", async () => {
  const fixture = await buildFixture({
    scenario: "usage_insufficient",
    mutateReceipt: (receipt) => ({
      ...receipt,
      extracted: {
        ...receipt.extracted,
        usage: {
          totalTokens: 120
        }
      }
    })
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.zkTlsProofValid, false);
  assert.equal(result.checks.usageSatisfied, false);
  assert.equal(result.aggregateUsage.totalTokens, 0);
  assert.equal(result.report.aggregateUsage.totalTokens, 0);
});

test("fails when receipt timestamp is changed away from the raw proof timestamp", async () => {
  const fixture = await buildFixture({
    scenario: "timestamp_after_deadline",
    mutateReceipt: (receipt) => ({
      ...receipt,
      observedAt: "1735686000000"
    })
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.zkTlsProofValid, false);
  assert.equal(result.checks.withinTaskWindow, false);
});

test("fails the task window check when receipt timestamp is mutated outside the window", async () => {
  const fixture = await buildFixture({
    mutateReceipt: (receipt) => ({
      ...receipt,
      observedAt: "1735689600001"
    })
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.zkTlsProofValid, false);
  assert.equal(result.checks.withinTaskWindow, false);
});

test("fails when receipt response hash differs from the raw proof response", async () => {
  const fixture = await buildFixture({
    mutateReceipt: (receipt) => ({
      ...receipt,
      responseHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    })
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.zkTlsProofValid, false);
});

test("fails endpoint and model checks when receipt proof matching fails", async () => {
  const fixture = await buildFixture({
    scenario: "model_mismatch",
    mutateReceipt: (receipt) => ({
      ...receipt,
      extracted: {
        ...receipt.extracted,
        model: "gpt-4o-mini"
      }
    })
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.zkTlsProofValid, false);
  assert.equal(result.checks.modelMatched, false);
  assert.equal(result.checks.endpointMatched, false);
  assert.equal(result.aggregateUsage.totalTokens, 0);
});

test("fails endpoint and model checks when raw proof evidence is unavailable", async () => {
  const fixture = await buildFixture({
    mutateReceipt: (receipt) => ({
      ...receipt,
      provider: "unsupported"
    })
  });
  const result = await fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false });

  assert.equal(result.report.passed, false);
  assert.equal(result.checks.zkTlsProofValid, false);
  assert.equal(result.checks.endpointMatched, false);
  assert.equal(result.checks.modelMatched, false);
});

test("rejects when the commitment assigns a different verifier", async () => {
  const fixture = await buildFixture({
    commitmentVerifier: "0x9999999999999999999999999999999999999999"
  });

  await assert.rejects(
    () => fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false }),
    /not the verifier assigned/
  );
});

test("rejects when the signer is not registry authorized", async () => {
  const fixture = await buildFixture({ verifierAuthorized: false });

  await assert.rejects(
    () => fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false }),
    /not authorized/
  );
});

test("rejects when the configured report verifier differs from the signer", async () => {
  const configuredVerifier = "0x9999999999999999999999999999999999999999";
  const fixture = await buildFixture({
    commitmentVerifier: configuredVerifier,
    verifierAddress: configuredVerifier
  });

  await assert.rejects(
    () => fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false }),
    /does not match signer/
  );
});

test("rejects when proof submission is outside the configured grace period", async () => {
  const fixture = await buildFixture({
    proofSubmittedAt: "1735690200001",
    proofSubmissionGracePeriod: "600000"
  });

  await assert.rejects(
    () => fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false }),
    /outside the configured grace period/
  );
});

test("rejects storage hash mismatches as integrity failures", async () => {
  const fixture = await buildFixture({ taskCommitmentHash: WRONG_COMMITMENT_HASH });

  await assert.rejects(
    () => fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false }),
    (error) => error instanceof VerifierInputIntegrityError && !(error instanceof VerifierInputUnavailableError)
  );
});

test("rejects when report generation is after the verification timeout", async () => {
  const fixture = await buildFixture({ verificationTimeout: "1000" });

  await assert.rejects(
    () => fixture.verifier.verifyTask(fixture.task.taskId, { markProofsConsumed: false }),
    /verification timeout expired/
  );
});

test("persists consumed proof keys through the Prisma registry adapter", async () => {
  const fixture = await buildFixture();
  const registry = new PrismaProofConsumptionRegistry(new FakePrismaClient());
  const keys = buildProofConsumptionKeys(fixture.proofBundle);
  const record = {
    taskId: fixture.task.taskId,
    proofBundleHash: fixture.task.proofBundleHash,
    reportHash: "0x8888888888888888888888888888888888888888888888888888888888888888" as Bytes32,
    passed: true,
    verifiedAt: VERIFIED_AT
  };

  assert.equal(await registry.hasAny(keys), false);
  await registry.markConsumed(keys, record);
  assert.equal(await registry.hasAny(keys), true);
  await assert.rejects(() => registry.markConsumed(keys, record), /already consumed/);
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
    verifier: options.commitmentVerifier ?? verifierAddress
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
  const callIntentHash = options.callIntentHash ?? buildCallIntentHash({
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
    commitmentHash: options.taskCommitmentHash ?? commitmentHash,
    commitmentURI: commitmentPointer.uri,
    fundedAt: FUNDED_AT,
    proofBundleHash: proofBundlePointer.hash,
    proofBundleURI: proofBundlePointer.uri,
    proofSubmittedAt: options.proofSubmittedAt ?? "1735686700000",
    status: "PROOF_SUBMITTED"
  };
  const settlement = new MockSettlementReader(
    task,
    options.verifierAuthorized ?? true,
    options.proofSubmissionGracePeriod,
    options.verificationTimeout
  );
  settlement.proofBundleConsumed = options.proofBundleConsumed ?? false;
  const verifier = new CentralizedVerifier({
    settlement,
    storage,
    signer: verifierWallet,
    zktlsAdapters: [mockZkTlsAdapter],
    consumptionRegistry: options.consumptionRegistry ?? new InMemoryProofConsumptionRegistry(),
    verifierAddress: options.verifierAddress,
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
