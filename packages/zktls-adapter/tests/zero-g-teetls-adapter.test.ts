import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { assertDeliveryReceipt, type Bytes32, type CallIntent, type TaskContext } from "@tyrpay/sdk-core";

import { hashRequestEvidence, hashResponseEvidence } from "../src/core/index.js";
import {
  ZERO_G_TEETLS_PROVIDER,
  ZeroGTeeTlsAdapter,
  hashZeroGTeeTlsRawProof,
  hashZeroGTeeTlsRawProofPayload,
  toZeroGTeeTlsRawProofPayload,
  type ZeroGComputeBrokerLike,
  type ZeroGTeeTlsProvenFetchInput
} from "../src/zero-g-teetls/index.js";

interface FixtureFile<T> {
  object: T;
  hash: string;
}

class FakeHeaders {
  constructor(private readonly values: Record<string, string>) {}

  get(name: string): string | null {
    return this.values[name.toLowerCase()] ?? null;
  }

  forEach(callback: (value: string, key: string) => void): void {
    for (const [key, value] of Object.entries(this.values)) {
      callback(value, key);
    }
  }
}

class FakeZeroGBroker implements ZeroGComputeBrokerLike {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  processResponseResult: boolean | null = true;
  services: unknown[] = [];
  metadataByProvider = new Map<string, { endpoint: string; model: string }>();

  inference = {
    listService: async () => {
      this.calls.push({ method: "listService", args: [] });
      return this.services;
    },
    getServiceMetadata: async (providerAddress: string) => {
      this.calls.push({ method: "getServiceMetadata", args: [providerAddress] });
      const configured = this.metadataByProvider.get(providerAddress);

      if (configured) {
        return configured;
      }

      return {
        endpoint: "https://compute-network-test.0g.ai/v1/proxy",
        model: "google/gemma-3-27b-it"
      };
    },
    getRequestHeaders: async (providerAddress: string, content?: string) => {
      this.calls.push({ method: "getRequestHeaders", args: [providerAddress, content] });
      return {
        Authorization: "Bearer test-session"
      };
    },
    processResponse: async (providerAddress: string, chatId?: string, content?: string) => {
      this.calls.push({ method: "processResponse", args: [providerAddress, chatId, content] });
      return this.processResponseResult;
    },
    checkProviderSignerStatus: async (providerAddress: string) => {
      this.calls.push({ method: "checkProviderSignerStatus", args: [providerAddress] });
      return {
        isAcknowledged: true,
        teeSignerAddress: "0x7777777777777777777777777777777777777777"
      };
    }
  };
}

const repoRoot = path.resolve(process.cwd(), "..", "..");
const providerAddress = "0x8888888888888888888888888888888888888888";

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")) as T;
}

function createBaseInput(): ZeroGTeeTlsProvenFetchInput {
  const taskContextFixture = loadJson<FixtureFile<TaskContext>>("test/fixtures/protocol/task-contexts/task-context.basic.json");
  const callIntentFixture = loadJson<FixtureFile<CallIntent>>("test/fixtures/protocol/call-intents/call-intent.basic.json");

  return {
    taskContext: taskContextFixture.object,
    callIndex: 0,
    callIntentHash: callIntentFixture.hash as Bytes32,
    request: {
      host: "compute-network-test.0g.ai",
      path: "/v1/proxy/chat/completions",
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        model: "google/gemma-3-27b-it",
        messages: [
          {
            role: "user",
            content: "ping"
          }
        ]
      }
    },
    declaredModel: "google/gemma-3-27b-it",
    providerAddress
  };
}

function createFetch(body: unknown = createCompletionBody()) {
  const calls: Array<{ url: string; init: unknown }> = [];
  const fetchImpl = async (url: string, init?: unknown) => {
    calls.push({ url, init });
    return {
      status: 200,
      headers: new FakeHeaders({
        "content-type": "application/json",
        "zg-res-key": "chat-0g-test"
      }),
      text: async () => JSON.stringify(body)
    };
  };

  return { fetchImpl, calls };
}

function createProbeAwareFetch(input: {
  unreachableHost: string;
  body?: unknown;
}) {
  const calls: Array<{ url: string; init: { method?: string } | undefined }> = [];
  const fetchImpl = async (url: string, init?: { method?: string }) => {
    calls.push({ url, init });

    if (init?.method === "GET" && url.includes(input.unreachableHost)) {
      throw new Error("TLS handshake failed");
    }

    return {
      status: init?.method === "GET" ? 400 : 200,
      headers: new FakeHeaders({
        "content-type": "application/json",
        "zg-res-key": "chat-0g-test"
      }),
      text: async () => JSON.stringify(input.body ?? createCompletionBody())
    };
  };

  return { fetchImpl, calls };
}

function createCompletionBody() {
  return {
    id: "chatcmpl-0g-test",
    object: "chat.completion",
    model: "gemma-3-27b-it",
    usage: {
      prompt_tokens: 7,
      completion_tokens: 9,
      total_tokens: 16
    },
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "pong"
        },
        logprobs: null
      }
    ]
  };
}

test("0G TeeTLS provenFetch builds a raw proof envelope from metadata, response, and processResponse", async () => {
  const broker = new FakeZeroGBroker();
  const { fetchImpl, calls } = createFetch();
  const adapter = new ZeroGTeeTlsAdapter({
    brokerFactory: () => broker,
    fetchImpl,
    clock: () => "1735686000000"
  });
  const result = await adapter.provenFetch(createBaseInput());

  assert.equal(result.rawProof.provider, ZERO_G_TEETLS_PROVIDER);
  assert.equal(result.rawProof.providerProofId, "chat-0g-test");
  assert.equal(result.rawProof.zeroG.endpoint, "https://compute-network-test.0g.ai/v1/proxy/chat/completions");
  assert.equal(result.rawProof.zeroG.modelFromMetadata, "google/gemma-3-27b-it");
  assert.equal(result.rawProof.zeroG.processResponseResult, true);
  assert.equal(result.rawProof.zeroG.signerAcknowledged, true);
  assert.equal(result.rawProof.zeroG.teeSignerAddress, "0x7777777777777777777777777777777777777777");
  assert.deepEqual(result.rawProof.zeroG.requestHeaderKeys, ["Authorization"]);
  assert.equal(result.extracted.model, "google/gemma-3-27b-it");
  assert.equal((result.rawProof.response.body as { choices: Array<{ logprobs?: unknown }> }).choices[0]?.logprobs, undefined);
  assert.equal(result.extracted.usage.totalTokens, 16);
  assert.equal(result.rawProof.proofHash, hashZeroGTeeTlsRawProofPayload(toZeroGTeeTlsRawProofPayload(result.rawProof)));
  assert.equal(await adapter.verifyRawProof(result.rawProof), true);

  assert.equal(calls[0]?.url, "https://compute-network-test.0g.ai/v1/proxy/chat/completions");
  assert.deepEqual(broker.calls.map((call) => call.method), [
    "getServiceMetadata",
    "getRequestHeaders",
    "processResponse",
    "checkProviderSignerStatus"
  ]);
  assert.deepEqual(broker.calls[1]?.args, [providerAddress, "ping"]);
  assert.deepEqual(broker.calls[2]?.args, [providerAddress, "chat-0g-test", "pong"]);
});

test("0G TeeTLS normalizeReceipt derives hashes and enforces proof-context binding", async () => {
  const broker = new FakeZeroGBroker();
  const { fetchImpl } = createFetch();
  const adapter = new ZeroGTeeTlsAdapter({
    brokerFactory: () => broker,
    fetchImpl,
    clock: () => "1735686000000"
  });
  const input = createBaseInput();
  const { rawProof } = await adapter.provenFetch(input);
  const receipt = await adapter.normalizeReceipt(rawProof, {
    taskContext: input.taskContext,
    callIndex: input.callIndex,
    callIntentHash: input.callIntentHash,
    rawProofURI: "0g-teetls://raw-proof"
  });

  assert.equal(receipt.provider, ZERO_G_TEETLS_PROVIDER);
  assert.equal(receipt.providerProofId, rawProof.providerProofId);
  assert.equal(receipt.requestHash, hashRequestEvidence(rawProof.request));
  assert.equal(receipt.responseHash, hashResponseEvidence(rawProof.response));
  assert.equal(receipt.rawProofHash, hashZeroGTeeTlsRawProof(rawProof));
  assert.equal(receipt.rawProofURI, "0g-teetls://raw-proof");
  assertDeliveryReceipt(receipt);

  await assert.rejects(
    () =>
      adapter.normalizeReceipt(rawProof, {
        taskContext: input.taskContext,
        callIndex: input.callIndex + 1,
        callIntentHash: input.callIntentHash,
        rawProofURI: "0g-teetls://raw-proof"
      }),
    /Proof context mismatch/
  );
});

test("0G TeeTLS verifyRawProof rejects failed processResponse", async () => {
  const broker = new FakeZeroGBroker();
  broker.processResponseResult = false;
  const { fetchImpl } = createFetch();
  const adapter = new ZeroGTeeTlsAdapter({
    brokerFactory: () => broker,
    fetchImpl,
    clock: () => "1735686000000"
  });
  const { rawProof } = await adapter.provenFetch(createBaseInput());

  assert.equal(await adapter.verifyRawProof(rawProof), false);
  await assert.rejects(
    () =>
      adapter.normalizeReceipt(rawProof, {
        taskContext: createBaseInput().taskContext,
        callIndex: 0,
        callIntentHash: createBaseInput().callIntentHash,
        rawProofURI: "0g-teetls://raw-proof"
      }),
    /0G TeeTLS raw proof failed verification/
  );
});

test("0G TeeTLS provenFetch rejects responses without recoverable usage", async () => {
  const broker = new FakeZeroGBroker();
  const body = createCompletionBody();
  delete (body as { usage?: unknown }).usage;
  const { fetchImpl } = createFetch(body);
  const adapter = new ZeroGTeeTlsAdapter({
    brokerFactory: () => broker,
    fetchImpl,
    clock: () => "1735686000000"
  });

  await assert.rejects(() => adapter.provenFetch(createBaseInput()), /usage\.total_tokens/);
});

test("0G TeeTLS provenFetch rejects requests that do not match resolved 0G endpoint", async () => {
  const broker = new FakeZeroGBroker();
  const { fetchImpl } = createFetch();
  const adapter = new ZeroGTeeTlsAdapter({
    brokerFactory: () => broker,
    fetchImpl,
    clock: () => "1735686000000"
  });

  await assert.rejects(
    () =>
      adapter.provenFetch({
        ...createBaseInput(),
        request: {
          ...createBaseInput().request,
          host: "api.openai.com"
        }
      }),
    /request.host/
  );
});

test("0G TeeTLS prepareOpenAiRequest selects a reachable chatbot provider", async () => {
  const staleProviderAddress = "0x9999999999999999999999999999999999999999";
  const reachableProviderAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const broker = new FakeZeroGBroker();
  broker.services = [
    {
      provider: staleProviderAddress,
      serviceType: "chatbot",
      model: "stale-model",
      url: "https://compute-network-stale.0g.ai",
      verifiability: "TeeML"
    },
    {
      provider: reachableProviderAddress,
      serviceType: "chatbot",
      model: "qwen/qwen-2.5-7b-instruct",
      url: "https://compute-network-live.0g.ai",
      verifiability: "TeeML"
    }
  ];
  broker.metadataByProvider.set(staleProviderAddress, {
    endpoint: "https://compute-network-stale.0g.ai/v1/proxy",
    model: "stale-model"
  });
  broker.metadataByProvider.set(reachableProviderAddress, {
    endpoint: "https://compute-network-live.0g.ai/v1/proxy",
    model: "qwen/qwen-2.5-7b-instruct"
  });
  const { fetchImpl, calls } = createProbeAwareFetch({
    unreachableHost: "compute-network-stale.0g.ai"
  });
  const adapter = new ZeroGTeeTlsAdapter({
    brokerFactory: () => broker,
    fetchImpl,
    clock: () => "1735686000000"
  });

  const prepared = await adapter.prepareOpenAiRequest({
    requestBody: {
      model: "ignored-client-model",
      messages: [{ role: "user", content: "ping" }]
    }
  });

  assert.equal(prepared.providerAddress, reachableProviderAddress);
  assert.equal(prepared.endpoint, "https://compute-network-live.0g.ai/v1/proxy/chat/completions");
  assert.equal(prepared.model, "qwen/qwen-2.5-7b-instruct");
  assert.equal(prepared.request.host, "compute-network-live.0g.ai");
  assert.equal(prepared.request.path, "/v1/proxy/chat/completions");
  assert.equal((prepared.request.body as { model: string }).model, "qwen/qwen-2.5-7b-instruct");
  assert.deepEqual(broker.calls.map((call) => call.method), [
    "listService",
    "getServiceMetadata",
    "getServiceMetadata"
  ]);
  assert.deepEqual(
    calls.map((call) => [call.url, call.init?.method]),
    [
      ["https://compute-network-stale.0g.ai/v1/proxy/chat/completions", "GET"],
      ["https://compute-network-live.0g.ai/v1/proxy/chat/completions", "GET"]
    ]
  );
});

test("0G TeeTLS provenFetch can fallback from an unreachable configured provider", async () => {
  const staleProviderAddress = "0x9999999999999999999999999999999999999999";
  const reachableProviderAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const broker = new FakeZeroGBroker();
  broker.services = [
    {
      provider: reachableProviderAddress,
      serviceType: "chatbot",
      model: "qwen/qwen-2.5-7b-instruct",
      url: "https://compute-network-live.0g.ai",
      verifiability: "TeeML"
    }
  ];
  broker.metadataByProvider.set(staleProviderAddress, {
    endpoint: "https://compute-network-stale.0g.ai/v1/proxy",
    model: "stale-model"
  });
  broker.metadataByProvider.set(reachableProviderAddress, {
    endpoint: "https://compute-network-live.0g.ai/v1/proxy",
    model: "qwen/qwen-2.5-7b-instruct"
  });
  const { fetchImpl } = createProbeAwareFetch({
    unreachableHost: "compute-network-stale.0g.ai"
  });
  const adapter = new ZeroGTeeTlsAdapter({
    providerAddress: staleProviderAddress,
    providerSelection: {
      enabled: true,
      fallbackOnUnreachable: true
    },
    brokerFactory: () => broker,
    fetchImpl,
    clock: () => "1735686000000"
  });
  const input = createBaseInput();

  const result = await adapter.provenFetch({
    ...input,
    providerAddress: undefined,
    declaredModel: "qwen/qwen-2.5-7b-instruct",
    request: {
      ...input.request,
      host: "compute-network-live.0g.ai",
      path: "/v1/proxy/chat/completions",
      body: {
        model: "client-model",
        messages: [{ role: "user", content: "ping" }]
      }
    }
  });

  assert.equal(result.rawProof.zeroG.providerAddress, reachableProviderAddress);
  assert.equal(result.rawProof.zeroG.endpoint, "https://compute-network-live.0g.ai/v1/proxy/chat/completions");
  assert.equal(result.extracted.model, "qwen/qwen-2.5-7b-instruct");
  assert.equal(await adapter.verifyRawProof(result.rawProof), true);
});
