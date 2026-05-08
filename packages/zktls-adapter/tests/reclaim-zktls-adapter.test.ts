import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { assertDeliveryReceipt, type Bytes32, type CallIntent, type TaskContext } from "@fulfillpay/sdk-core";

import {
  ReclaimZkTlsAdapter,
  hashReclaimRawProof,
  hashReclaimRawProofPayload,
  toReclaimRawProofPayload,
  type ReclaimClientLike,
  type ReclaimPrivateOptions,
  type ReclaimPublicOptions,
  type ReclaimProvenFetchInput
} from "../src/reclaim/index.js";

interface FixtureFile<T> {
  object: T;
  hash: string;
}

class FakeReclaimClient implements ReclaimClientLike {
  capturedArgs: unknown[] | null = null;

  async zkFetch(
    url: string,
    publicOptions: ReclaimPublicOptions,
    privateOptions?: ReclaimPrivateOptions,
    retries?: number,
    retryInterval?: number
  ): Promise<unknown> {
    this.capturedArgs = [url, publicOptions, privateOptions, retries, retryInterval];

    return {
      identifier: "reclaim-proof-test",
      claimData: {
        timestampS: "1735686000",
        context: publicOptions.context
      },
      response: {
        status: 200
      },
      extractedParameterValues: {
        data: JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          created: 1735686000,
          model: "gpt-4o-mini",
          usage: {
            total_tokens: 128
          },
          choices: []
        })
      }
    };
  }
}

const repoRoot = path.resolve(process.cwd(), "..", "..");

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")) as T;
}

function createBaseInput(): ReclaimProvenFetchInput {
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
    privateOptions: {
      headers: {
        authorization: "Bearer test"
      }
    },
    retries: 2,
    retryIntervalMs: 500,
    useTee: true
  };
}

test("reclaim provenFetch maps request options and builds a raw proof envelope", async () => {
  const client = new FakeReclaimClient();
  const adapter = new ReclaimZkTlsAdapter({
    clientFactory: () => client,
    verifyProof: () => true
  });
  const result = await adapter.provenFetch(createBaseInput());

  assert.equal(result.rawProof.provider, "reclaim");
  assert.equal(result.rawProof.providerProofId, "reclaim-proof-test");
  assert.equal(result.rawProof.observedAt, "1735686000000");
  assert.equal(result.extracted.model, "gpt-4o-mini");
  assert.equal(result.extracted.usage.totalTokens, 128);
  assert.equal(await adapter.verifyRawProof(result.rawProof), true);
  assert.equal(result.rawProof.proofHash, hashReclaimRawProofPayload(toReclaimRawProofPayload(result.rawProof)));
  const proofContext = (result.rawProof.reclaimProof as { claimData: { context: string } }).claimData.context;

  assert.deepEqual(client.capturedArgs, [
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "ping"
          }
        ]
      },
      context: proofContext
    },
    {
      headers: {
        authorization: "Bearer test"
      }
    },
    2,
    500
  ]);
});

test("reclaim normalizeReceipt derives hashes and enforces proof-context binding", async () => {
  const adapter = new ReclaimZkTlsAdapter({
    appId: "app-id",
    appSecret: "app-secret",
    clientFactory: () => new FakeReclaimClient(),
    verifyProof: () => true
  });
  const input = createBaseInput();
  const { rawProof } = await adapter.provenFetch(input);
  const receipt = await adapter.normalizeReceipt(rawProof, {
    taskContext: input.taskContext,
    callIndex: input.callIndex,
    callIntentHash: input.callIntentHash,
    rawProofURI: "reclaim://raw-proof"
  });

  assert.equal(receipt.provider, "reclaim");
  assert.equal(receipt.providerProofId, "reclaim-proof-test");
  assert.equal(receipt.rawProofHash, hashReclaimRawProof(rawProof));
  assert.equal(receipt.rawProofURI, "reclaim://raw-proof");
  assert.equal(receipt.extracted.model, "gpt-4o-mini");
  assertDeliveryReceipt(receipt);

  await assert.rejects(
    () =>
      adapter.normalizeReceipt(rawProof, {
        taskContext: input.taskContext,
        callIndex: input.callIndex + 1,
        callIntentHash: input.callIntentHash,
        rawProofURI: "reclaim://raw-proof"
      }),
    /Proof context mismatch/
  );
});

test("reclaim verifyRawProof rejects envelope tampering", async () => {
  const adapter = new ReclaimZkTlsAdapter({
    appId: "app-id",
    appSecret: "app-secret",
    clientFactory: () => new FakeReclaimClient(),
    verifyProof: () => true
  });
  const { rawProof } = await adapter.provenFetch(createBaseInput());
  const tampered = structuredClone(rawProof);

  tampered.extracted.usage.totalTokens += 1;

  assert.equal(await adapter.verifyRawProof(tampered), false);
});

test("reclaim verifyRawProof rejects rehashed envelopes that diverge from native proof evidence", async () => {
  const adapter = new ReclaimZkTlsAdapter({
    appId: "app-id",
    appSecret: "app-secret",
    clientFactory: () => new FakeReclaimClient(),
    verifyProof: () => true
  });
  const { rawProof } = await adapter.provenFetch(createBaseInput());
  const tampered = structuredClone(rawProof);

  tampered.extracted.model = "gpt-4o";
  tampered.proofHash = hashReclaimRawProofPayload(toReclaimRawProofPayload(tampered));

  assert.equal(await adapter.verifyRawProof(tampered), false);
});

test("reclaim verifyRawProof rejects native proofs without FulfillPay context binding", async () => {
  const adapter = new ReclaimZkTlsAdapter({
    appId: "app-id",
    appSecret: "app-secret",
    clientFactory: () => new FakeReclaimClient(),
    verifyProof: () => true
  });
  const { rawProof } = await adapter.provenFetch(createBaseInput());
  const tampered = structuredClone(rawProof);

  delete (tampered.reclaimProof as { claimData: { context?: string } }).claimData.context;
  tampered.proofHash = hashReclaimRawProofPayload(toReclaimRawProofPayload(tampered));

  assert.equal(await adapter.verifyRawProof(tampered), false);
});

test("reclaim extractReceiptEvidence returns verifier-compatible evidence", async () => {
  const adapter = new ReclaimZkTlsAdapter({
    appId: "app-id",
    appSecret: "app-secret",
    clientFactory: () => new FakeReclaimClient(),
    verifyProof: () => true
  });
  const { rawProof } = await adapter.provenFetch(createBaseInput());
  const evidence = await adapter.extractReceiptEvidence(rawProof);

  assert.deepEqual(evidence, {
    provider: "reclaim",
    providerProofId: "reclaim-proof-test",
    request: rawProof.request,
    response: rawProof.response,
    observedAt: rawProof.observedAt,
    extracted: rawProof.extracted
  });
});
