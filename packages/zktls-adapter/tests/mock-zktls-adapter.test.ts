import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { type Bytes32, type CallIntent, type TaskContext } from "@fulfillpay/sdk-core";

import { hashRequestEvidence, hashResponseEvidence } from "../src/core/index.js";
import {
  DEFAULT_MOCK_OBSERVED_AT,
  MockZkTlsAdapter,
  hashMockRawProof,
  type MockProvenFetchInput
} from "../src/mock/index.js";

interface FixtureFile<T> {
  object: T;
  hash: string;
}

const repoRoot = path.resolve(process.cwd(), "..", "..");

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")) as T;
}

function createBaseInput(): MockProvenFetchInput {
  const taskContextFixture = loadJson<FixtureFile<TaskContext>>("test/fixtures/protocol/task-contexts/task-context.basic.json");
  const callIntentFixture = loadJson<FixtureFile<CallIntent>>("test/fixtures/protocol/call-intents/call-intent.basic.json");

  return {
    taskContext: taskContextFixture.object,
    callIndex: 0,
    callIntentHash: callIntentFixture.hash as Bytes32,
    request: {
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "ping"
          }
        ]
      }
    },
    declaredModel: "gpt-4o-mini",
    totalTokens: 128,
    observedAt: DEFAULT_MOCK_OBSERVED_AT
  };
}

test("mock provenFetch is deterministic and yields a verifiable raw proof", async () => {
  const adapter = new MockZkTlsAdapter();
  const input = createBaseInput();

  const first = await adapter.provenFetch(input);
  const second = await adapter.provenFetch(input);

  assert.deepEqual(first.rawProof, second.rawProof);
  assert.equal(first.extracted.model, "gpt-4o-mini");
  assert.equal(first.extracted.usage.totalTokens, 128);
  assert.equal(await adapter.verifyRawProof(first.rawProof), true);
  assert.match(first.rawProof.providerProofId, /^mock-proof-[0-9a-f]{12}$/);
});

test("mock verifyRawProof detects tampering", async () => {
  const adapter = new MockZkTlsAdapter();
  const { rawProof } = await adapter.provenFetch(createBaseInput());
  const tampered = structuredClone(rawProof);

  tampered.extracted.usage.totalTokens += 1;

  assert.equal(await adapter.verifyRawProof(tampered), false);
});

test("normalizeReceipt derives hashes and enforces proof-context binding", async () => {
  const adapter = new MockZkTlsAdapter();
  const input = createBaseInput();
  const { rawProof } = await adapter.provenFetch(input);
  const receipt = await adapter.normalizeReceipt(rawProof, {
    taskContext: input.taskContext,
    callIndex: input.callIndex,
    callIntentHash: input.callIntentHash,
    rawProofURI: "mock://custom/raw-proof"
  });

  assert.equal(receipt.provider, "mock");
  assert.equal(receipt.providerProofId, rawProof.providerProofId);
  assert.equal(receipt.requestHash, hashRequestEvidence(rawProof.request));
  assert.equal(receipt.responseHash, hashResponseEvidence(rawProof.response));
  assert.equal(receipt.rawProofHash, hashMockRawProof(rawProof));
  assert.equal(receipt.rawProofURI, "mock://custom/raw-proof");
  assert.equal(receipt.observedAt, DEFAULT_MOCK_OBSERVED_AT);

  await assert.rejects(
    () =>
      adapter.normalizeReceipt(rawProof, {
        taskContext: input.taskContext,
        callIndex: input.callIndex + 1,
        callIntentHash: input.callIntentHash
      }),
    /Proof context mismatch/
  );
});

test("mock adapter simulates model mismatch and insufficient usage scenarios", async () => {
  const adapter = new MockZkTlsAdapter();

  const modelMismatch = await adapter.provenFetch({
    ...createBaseInput(),
    scenario: "model_mismatch"
  });
  const usageInsufficient = await adapter.provenFetch({
    ...createBaseInput(),
    scenario: "usage_insufficient",
    commitmentMinTokens: 120
  });

  assert.equal(modelMismatch.extracted.model, "gpt-4o-mini-mismatch");
  assert.equal(usageInsufficient.extracted.usage.totalTokens, 119);
});

test("mock adapter simulates timestamp-invalid scenarios relative to fundedAt and deadline", async () => {
  const adapter = new MockZkTlsAdapter();

  const beforeFunded = await adapter.provenFetch({
    ...createBaseInput(),
    observedAt: undefined,
    scenario: "timestamp_before_funded",
    timeWindow: {
      fundedAt: "1735686000000"
    }
  });
  const afterDeadline = await adapter.provenFetch({
    ...createBaseInput(),
    observedAt: undefined,
    scenario: "timestamp_after_deadline",
    timeWindow: {
      deadline: "1735689600000"
    }
  });

  assert.equal(beforeFunded.rawProof.observedAt, "1735685999999");
  assert.equal(afterDeadline.rawProof.observedAt, "1735689600001");
});
