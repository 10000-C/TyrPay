import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ProofBundle } from "@fulfillpay/sdk-core";

import { LocalStorageAdapter, MemoryStorageAdapter, ZeroGStorageAdapter, type ZeroGStorageTransport } from "../src/index.js";

interface FixtureFile<T> {
  object: T;
  canonical: string;
  hash: string;
}

function loadFixture<T>(relativePath: string): FixtureFile<T> {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), "..", "..", relativePath), "utf8")) as FixtureFile<T>;
}

import { readFileSync } from "node:fs";

test("memory adapter stores and retrieves canonical proof bundles with a stable hash", async () => {
  const fixture = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");
  const adapter = new MemoryStorageAdapter();

  const pointer = await adapter.putObject(fixture.object, { namespace: "proof-bundles" });
  const restored = await adapter.getObject<ProofBundle>(pointer);

  assert.equal(pointer.hash, fixture.hash);
  assert.equal(pointer.uri, `memory://storage/proof-bundles/${fixture.hash}.json`);
  assert.deepEqual(restored, fixture.object);
});

test("local adapter persists payloads under file URIs and reloads them with hash verification", async () => {
  const fixture = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");
  const baseDirectory = await mkdtemp(path.join(tmpdir(), "fulfillpay-storage-"));
  const adapter = new LocalStorageAdapter({ baseDirectory });

  try {
    const pointer = await adapter.putObject(fixture.object, { namespace: "proof-bundles" });
    const restored = await adapter.getObject<ProofBundle>(pointer);

    assert.equal(pointer.hash, fixture.hash);
    assert.match(pointer.uri, /^file:\/\//);
    assert.deepEqual(restored, fixture.object);
  } finally {
    await rm(baseDirectory, { recursive: true, force: true });
  }
});

test("zero-g adapter preserves the storage adapter contract through an injected transport", async () => {
  const fixture = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");
  const backingStore = new Map<string, string>();
  const transport: ZeroGStorageTransport = {
    async putObject(request) {
      const uri = `0g://storage/${request.namespace}/${request.hash}.json`;
      backingStore.set(uri, request.canonical);
      return { uri };
    },
    async getObject(uri) {
      const payload = backingStore.get(uri);

      if (!payload) {
        throw new Error(`Missing payload for ${uri}`);
      }

      return payload;
    }
  };
  const adapter = new ZeroGStorageAdapter({ transport });

  const pointer = await adapter.putObject(fixture.object, { namespace: "proof-bundles" });
  const restored = await adapter.getObject<ProofBundle>(pointer);

  assert.equal(pointer.hash, fixture.hash);
  assert.equal(pointer.uri, `0g://storage/proof-bundles/${fixture.hash}.json`);
  assert.deepEqual(restored, fixture.object);
});
