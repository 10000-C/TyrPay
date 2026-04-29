import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildCallIntent,
  buildCallIntentHash,
  buildTaskContext,
  buildTaskContextHash,
  buildVerificationReportTypedData,
  canonicalize,
  hashCallIntent,
  hashDeliveryReceipt,
  hashExecutionCommitment,
  hashProofBundle,
  hashTaskContext,
  hashTaskIntent,
  hashVerificationReport,
  hashVerificationReportStruct,
  hashVerificationReportTypedData,
  type BuildCallIntentInput,
  type CallIntent,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type ProofBundle,
  type TaskContext,
  type TaskIntent,
  type UnsignedVerificationReport
} from "../src/index.js";

interface FixtureFile<T> {
  object: T;
  canonical: string;
  hash: string;
}

interface HashVectorFile {
  hashes: {
    taskIntentHash: string;
    taskContextHash: string;
    commitmentHash: string;
    callIntentHash: string;
    receiptHash: string;
    proofBundleHash: string;
    verificationReportHash: string;
  };
}

interface Eip712VectorFile {
  domain: {
    name: string;
    version: string;
    chainId: string;
    verifyingContract: string;
  };
  message: {
    taskId: string;
    buyer: string;
    seller: string;
    commitmentHash: string;
    proofBundleHash: string;
    passed: boolean;
    settlementAction: number;
    settlementAmount: string;
    verifiedAt: string;
    reportHash: string;
  };
  typeHashes: {
    structHash: string;
    digest: string;
  };
}

const repoRoot = path.resolve(process.cwd(), "..", "..");

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")) as T;
}

function loadFixture<T>(relativePath: string): FixtureFile<T> {
  return loadJson<FixtureFile<T>>(relativePath);
}

test("canonicalize sorts keys deterministically and rejects unsupported values", () => {
  const canonical = canonicalize({
    z: ["b", { c: 1, a: true }],
    a: "first"
  });

  assert.equal(canonical, "{\"a\":\"first\",\"z\":[\"b\",{\"a\":true,\"c\":1}]}");
  assert.throws(() => canonicalize({ invalid: undefined }), /must not be undefined/);
  assert.throws(() => canonicalize({ invalid: 1n }), /must not be a bigint/);
});

test("fixture canonical strings and hashes match sdk-core helpers", () => {
  const taskIntent = loadFixture<TaskIntent>("test/fixtures/protocol/task-intents/task-intent.basic.json");
  const taskContext = loadFixture<TaskContext>("test/fixtures/protocol/task-contexts/task-context.basic.json");
  const commitment = loadFixture<ExecutionCommitment>("test/fixtures/protocol/commitments/commitment.openai-compatible.json");
  const callIntent = loadFixture<CallIntent>("test/fixtures/protocol/call-intents/call-intent.basic.json");
  const receipt = loadFixture<DeliveryReceipt>("test/fixtures/protocol/receipts/receipt.mock.valid.json");
  const proofBundle = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");
  const verificationReport = loadFixture<UnsignedVerificationReport>(
    "test/fixtures/protocol/verification-reports/verification-report.pass-basic.unsigned.json"
  );
  const vector = loadJson<HashVectorFile>("test/vectors/hashing/pass-basic.json");

  assert.equal(canonicalize(taskIntent.object), taskIntent.canonical);
  assert.equal(canonicalize(taskContext.object), taskContext.canonical);
  assert.equal(canonicalize(commitment.object), commitment.canonical);
  assert.equal(canonicalize(callIntent.object), callIntent.canonical);
  assert.equal(canonicalize(receipt.object), receipt.canonical);
  assert.equal(canonicalize(proofBundle.object), proofBundle.canonical);
  assert.equal(canonicalize(verificationReport.object), verificationReport.canonical);

  assert.equal(hashTaskIntent(taskIntent.object), taskIntent.hash);
  assert.equal(hashTaskContext(taskContext.object), taskContext.hash);
  assert.equal(hashExecutionCommitment(commitment.object), commitment.hash);
  assert.equal(hashCallIntent(callIntent.object), callIntent.hash);
  assert.equal(hashDeliveryReceipt(receipt.object), receipt.hash);
  assert.equal(hashProofBundle(proofBundle.object), proofBundle.hash);
  assert.equal(hashVerificationReport(verificationReport.object), verificationReport.hash);

  assert.equal(taskIntent.hash, vector.hashes.taskIntentHash);
  assert.equal(taskContext.hash, vector.hashes.taskContextHash);
  assert.equal(commitment.hash, vector.hashes.commitmentHash);
  assert.equal(callIntent.hash, vector.hashes.callIntentHash);
  assert.equal(receipt.hash, vector.hashes.receiptHash);
  assert.equal(proofBundle.hash, vector.hashes.proofBundleHash);
  assert.equal(verificationReport.hash, vector.hashes.verificationReportHash);
});

test("task context and call intent builders reproduce the fixture vectors", () => {
  const taskContextFixture = loadFixture<TaskContext>("test/fixtures/protocol/task-contexts/task-context.basic.json");
  const callIntentFixture = loadFixture<CallIntent>("test/fixtures/protocol/call-intents/call-intent.basic.json");

  const builtTaskContext = buildTaskContext({
    chainId: 31337n,
    settlementContract: taskContextFixture.object.settlementContract.toUpperCase(),
    taskId: taskContextFixture.object.taskId.toUpperCase(),
    taskNonce: taskContextFixture.object.taskNonce.toUpperCase(),
    commitmentHash: taskContextFixture.object.commitmentHash.toUpperCase(),
    buyer: taskContextFixture.object.buyer.toUpperCase(),
    seller: taskContextFixture.object.seller.toUpperCase()
  });

  assert.deepEqual(builtTaskContext, taskContextFixture.object);
  assert.equal(hashTaskContext(builtTaskContext), taskContextFixture.hash);
  assert.equal(buildTaskContextHash({
    chainId: taskContextFixture.object.chainId,
    settlementContract: taskContextFixture.object.settlementContract,
    taskId: taskContextFixture.object.taskId,
    taskNonce: taskContextFixture.object.taskNonce,
    commitmentHash: taskContextFixture.object.commitmentHash,
    buyer: taskContextFixture.object.buyer,
    seller: taskContextFixture.object.seller
  }), taskContextFixture.hash);

  const builtCallIntent = buildCallIntent({
    taskContextHash: taskContextFixture.hash,
    callIndex: callIntentFixture.object.callIndex,
    host: callIntentFixture.object.host,
    path: callIntentFixture.object.path,
    method: "post",
    declaredModel: callIntentFixture.object.declaredModel,
    requestBodyHash: callIntentFixture.object.requestBodyHash
  } satisfies BuildCallIntentInput);

  assert.deepEqual(builtCallIntent, callIntentFixture.object);
  assert.equal(hashCallIntent(builtCallIntent), callIntentFixture.hash);
  assert.equal(
    buildCallIntentHash({
      taskContext: builtTaskContext,
      callIndex: callIntentFixture.object.callIndex,
      host: callIntentFixture.object.host,
      path: callIntentFixture.object.path,
      method: callIntentFixture.object.method,
      declaredModel: callIntentFixture.object.declaredModel,
      requestBodyHash: callIntentFixture.object.requestBodyHash
    }),
    callIntentFixture.hash
  );
});

test("verification report hash ignores reportHash and signature fields", () => {
  const reportFixture = loadFixture<UnsignedVerificationReport>(
    "test/fixtures/protocol/verification-reports/verification-report.pass-basic.unsigned.json"
  );

  const withDecorations = {
    ...reportFixture.object,
    reportHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    signature: "0xbb" as const
  };

  assert.equal(hashVerificationReport(withDecorations), reportFixture.hash);
});

test("eip712 helpers reproduce the verification report vector", () => {
  const reportFixture = loadFixture<UnsignedVerificationReport>(
    "test/fixtures/protocol/verification-reports/verification-report.pass-basic.unsigned.json"
  );
  const vector = loadJson<Eip712VectorFile>("test/vectors/eip712/verification-report-pass-basic.json");

  const typedData = buildVerificationReportTypedData(reportFixture.object);

  assert.deepEqual(typedData.domain, {
    name: vector.domain.name,
    version: vector.domain.version,
    chainId: BigInt(vector.domain.chainId),
    verifyingContract: vector.domain.verifyingContract
  });
  assert.deepEqual(typedData.message, {
    taskId: vector.message.taskId,
    buyer: vector.message.buyer,
    seller: vector.message.seller,
    commitmentHash: vector.message.commitmentHash,
    proofBundleHash: vector.message.proofBundleHash,
    passed: vector.message.passed,
    settlementAction: vector.message.settlementAction,
    settlementAmount: BigInt(vector.message.settlementAmount),
    verifiedAt: BigInt(vector.message.verifiedAt),
    reportHash: vector.message.reportHash
  });

  assert.equal(hashVerificationReportStruct(reportFixture.object), vector.typeHashes.structHash);
  assert.equal(hashVerificationReportTypedData(reportFixture.object), vector.typeHashes.digest);
});
