import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ProofBundle } from "@fulfillpay/sdk-core";

import {
  LocalStorageAdapter,
  MemoryStorageAdapter,
  StorageConfigurationError,
  StorageIntegrityError,
  StorageNotFoundError,
  ZeroGStorageAdapter,
  buildZeroGStorageUri,
  createZeroGStorageTransport,
  parseZeroGStorageUri,
  type ZeroGStorageSdkIndexer,
  type ZeroGStorageSigner,
  type ZeroGStorageTransport
} from "../src/index.js";

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

test("memory adapter detects in-memory tampering before returning stored objects", async () => {
  const fixture = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");
  const adapter = new MemoryStorageAdapter();
  const pointer = await adapter.putObject(fixture.object, { namespace: "proof-bundles" });

  const store = adapter as unknown as {
    store: Map<string, { canonical: string; hash: string }>;
  };

  store.store.set(pointer.uri, {
    canonical: JSON.stringify({ tampered: true }),
    hash: pointer.hash
  });

  await assert.rejects(() => adapter.getObject(pointer), StorageIntegrityError);
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

test("local adapter rejects tampered files", async () => {
  const fixture = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");
  const baseDirectory = await mkdtemp(path.join(tmpdir(), "fulfillpay-storage-"));
  const adapter = new LocalStorageAdapter({ baseDirectory });

  try {
    const pointer = await adapter.putObject(fixture.object, { namespace: "proof-bundles" });
    const filePath = new URL(pointer.uri);

    await writeFile(filePath, JSON.stringify({ tampered: true }), "utf8");

    await assert.rejects(() => adapter.getObject(pointer), StorageIntegrityError);
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

test("zero-g storage URIs preserve FulfillPay hashes and 0G root hashes separately", () => {
  const hash = `0x${"1".repeat(64)}` as `0x${string}`;
  const rootHash = `0x${"2".repeat(64)}`;
  const txHash = `0x${"3".repeat(64)}`;
  const uri = buildZeroGStorageUri({
    namespace: "proof-bundles",
    hash,
    rootHash,
    txHash
  });

  assert.equal(uri, `0g://storage/proof-bundles/${hash}.json?root=${rootHash}&tx=${txHash}`);
  assert.deepEqual(parseZeroGStorageUri(uri), {
    namespace: "proof-bundles",
    hash,
    rootHash,
    txHash
  });
});

test("zero-g storage URI parsing requires a 0G root hash", () => {
  const hash = `0x${"1".repeat(64)}` as `0x${string}`;

  assert.throws(
    () => parseZeroGStorageUri(`0g://storage/proof-bundles/${hash}.json`),
    StorageConfigurationError
  );
});

test("zero-g SDK transport uploads canonical payloads and downloads by root hash", async () => {
  const fixture = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");
  const rootHash = `0x${"2".repeat(64)}`;
  const txHash = `0x${"3".repeat(64)}`;
  const downloadedPayloads = new Map<string, string>();
  const indexer: ZeroGStorageSdkIndexer = {
    async upload(file, evmRpc) {
      assert.equal(evmRpc, "https://evmrpc-testnet.0g.ai");
      downloadedPayloads.set(rootHash, Buffer.from(Array.from(file.data)).toString("utf8"));

      return [{ txHash, rootHash }, null];
    },
    async download(requestedRootHash, filePath, withProof) {
      assert.equal(requestedRootHash, rootHash);
      assert.equal(withProof, false);

      const payload = downloadedPayloads.get(requestedRootHash);

      if (!payload) {
        return new Error(`Missing payload for ${requestedRootHash}`);
      }

      await writeFile(filePath, payload, "utf8");
      return null;
    }
  };
  const adapter = new ZeroGStorageAdapter({
    transport: createZeroGStorageTransport({
      indexer,
      evmRpc: "https://evmrpc-testnet.0g.ai",
      signer: {} as ZeroGStorageSigner,
      withProof: false
    })
  });

  const pointer = await adapter.putObject(fixture.object, { namespace: "proof-bundles" });
  const restored = await adapter.getObject<ProofBundle>(pointer);

  assert.equal(pointer.hash, fixture.hash);
  assert.equal(pointer.uri, `0g://storage/proof-bundles/${fixture.hash}.json?root=${rootHash}&tx=${txHash}`);
  assert.deepEqual(restored, fixture.object);
});

test("zero-g adapter fails fast when no transport is configured", async () => {
  const fixture = loadFixture<ProofBundle>("test/fixtures/protocol/proof-bundles/proof-bundle.pass-basic.json");
  const adapter = new ZeroGStorageAdapter();

  await assert.rejects(() => adapter.putObject(fixture.object), StorageConfigurationError);
});

test("zero-g adapter normalizes transport-level missing payloads into StorageNotFoundError", async () => {
  const missingHash = `0x${"1".repeat(64)}` as `0x${string}`;
  const missingUri = `0g://storage/proof-bundles/${missingHash}.json`;
  const transport: ZeroGStorageTransport = {
    async putObject(request) {
      return { uri: `0g://storage/${request.namespace}/${request.hash}.json` };
    },
    async getObject(uri) {
      throw new Error(`Missing payload for ${uri}`);
    }
  };
  const adapter = new ZeroGStorageAdapter({ transport });

  await assert.rejects(
    () =>
      adapter.getObject({
        uri: missingUri,
        hash: missingHash
      }),
    StorageNotFoundError
  );
});
