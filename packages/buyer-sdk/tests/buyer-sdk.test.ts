import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { readFileSync } from "node:fs";

import type { ExecutionCommitment, VerificationReport } from "@tyrpay/sdk-core";
import { MemoryStorageAdapter } from "@tyrpay/storage-adapter";

import { BuyerSdk } from "../src/client.js";
import { BuyerSdkConfigurationError, type BuyerSdkConfig } from "../src/types.js";

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
  const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");
  return JSON.parse(readFileSync(path.resolve(projectRoot, relativePath), "utf8")) as FixtureFile<T>;
}

const commitmentFixture = loadFixture<ExecutionCommitment>(
  "test/fixtures/protocol/commitments/commitment.openai-compatible.json"
);

// Use the unsigned report object as the base; sign field is added per-test where needed.
const reportFixtureHash = "0x4e0608cf3e990bf12dad76e616c9bb51f4eb117aa140cc94001868f4fa328a82";
const reportFixtureObject = loadFixture<unknown>(
  "test/fixtures/protocol/verification-reports/verification-report.pass-basic.unsigned.json"
).object;

// ── Constants ────────────────────────────────────────────────────

const BUYER    = "0x1111111111111111111111111111111111111111";
const SELLER   = "0x2222222222222222222222222222222222222222";
const TOKEN    = "0x3333333333333333333333333333333333333333";
const SETTLEMENT = "0x4444444444444444444444444444444444444444";
const TASK_ID  = "0x5555555555555555555555555555555555555555555555555555555555555555";
const TASK_NONCE = "0x6666666666666666666666666666666666666666666666666666666666666666";
const VERIFIER = "0x7777777777777777777777777777777777777777";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

const FAR_FUTURE_MS = 2700000000000n;
const PAST_MS       = 1000000000000n;

// ── Mock helpers ─────────────────────────────────────────────────

interface MockContractTask {
  taskId: string;
  taskNonce: string;
  buyer: string;
  seller: string;
  token: string;
  amount: bigint;
  deadlineMs: bigint;
  commitmentHash: string;
  commitmentURI: string;
  fundedAtMs: bigint;
  proofBundleHash: string;
  proofBundleURI: string;
  proofSubmittedAtMs: bigint;
  reportHash: string;
  settledAtMs: bigint;
  refundedAtMs: bigint;
  status: bigint;
}

function makeTask(overrides: Partial<MockContractTask> = {}): MockContractTask {
  return {
    taskId: TASK_ID,
    taskNonce: TASK_NONCE,
    buyer: BUYER,
    seller: SELLER,
    token: TOKEN,
    amount: 1_000_000n,
    deadlineMs: FAR_FUTURE_MS,
    commitmentHash: ZERO_HASH,
    commitmentURI: "",
    fundedAtMs: 0n,
    proofBundleHash: ZERO_HASH,
    proofBundleURI: "",
    proofSubmittedAtMs: 0n,
    reportHash: ZERO_HASH,
    settledAtMs: 0n,
    refundedAtMs: 0n,
    status: 1n, // COMMITMENT_SUBMITTED
    ...overrides
  };
}

function createSdk(opts: {
  contractTask?: MockContractTask;
  currentTimeMs?: bigint;
  storage?: MemoryStorageAdapter;
  reportResolver?: { getReport: (input: unknown) => Promise<VerificationReport | null> };
} = {}): BuyerSdk {
  const mockSigner = {
    getAddress: async () => BUYER,
    provider: { getNetwork: async () => ({ chainId: 31337n }) }
  };

  const config: BuyerSdkConfig = {
    settlementAddress: SETTLEMENT,
    signer: mockSigner as unknown as BuyerSdkConfig["signer"],
    storage: opts.storage,
    reportResolver: opts.reportResolver as BuyerSdkConfig["reportResolver"]
  };

  const sdk = new BuyerSdk(config);

  (sdk as unknown as { contract: unknown }).contract = {
    getTask: async () => opts.contractTask ?? makeTask(),
    currentTimeMs: async () => opts.currentTimeMs ?? 1_600_000_000_000n,
    fundTask: async () => ({ wait: async () => ({}) })
  };

  return sdk;
}

async function makeCommitmentSdk(commitmentOverrides?: Partial<ExecutionCommitment>): Promise<{
  storage: MemoryStorageAdapter;
  commitment: ExecutionCommitment;
  pointer: { uri: string; hash: string };
  sdk: BuyerSdk;
}> {
  const commitment: ExecutionCommitment = {
    ...commitmentFixture.object,
    ...commitmentOverrides
  };
  const storage = new MemoryStorageAdapter();
  const pointer = await storage.putObject(commitment, { namespace: "commitments" });
  const sdk = createSdk({
    storage,
    contractTask: makeTask({
      commitmentHash: pointer.hash,
      commitmentURI: pointer.uri,
      deadlineMs: FAR_FUTURE_MS
    })
  });
  return { storage, commitment, pointer, sdk };
}

// ── Tests ────────────────────────────────────────────────────────

describe("BuyerSdk", () => {

  // ── Constructor ──────────────────────────────────────────────────

  describe("constructor", () => {
    it("throws BuyerSdkConfigurationError when signer has no provider", () => {
      assert.throws(
        () =>
          new BuyerSdk({
            settlementAddress: SETTLEMENT,
            signer: { provider: null } as unknown as BuyerSdkConfig["signer"]
          }),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkConfigurationError");
          return true;
        }
      );
    });

    it("throws when settlement address is not a valid hex address", () => {
      assert.throws(() =>
        new BuyerSdk({
          settlementAddress: "not-an-address",
          signer: { provider: {} } as unknown as BuyerSdkConfig["signer"]
        })
      );
    });
  });

  // ── getTaskStatus ─────────────────────────────────────────────────

  describe("getTaskStatus", () => {
    it("returns EXECUTING for a FUNDED task", async () => {
      const sdk = createSdk({ contractTask: makeTask({ status: 2n }) });
      assert.equal(await sdk.getTaskStatus(TASK_ID), "EXECUTING");
    });

    it("returns EXPIRED for INTENT_CREATED task past its deadline", async () => {
      const sdk = createSdk({
        contractTask: makeTask({ status: 0n, deadlineMs: PAST_MS }),
        currentTimeMs: PAST_MS + 1n
      });
      assert.equal(await sdk.getTaskStatus(TASK_ID), "EXPIRED");
    });

    it("returns EXPIRED for COMMITMENT_SUBMITTED task past its deadline", async () => {
      const sdk = createSdk({
        contractTask: makeTask({ status: 1n, deadlineMs: PAST_MS }),
        currentTimeMs: PAST_MS + 1n
      });
      assert.equal(await sdk.getTaskStatus(TASK_ID), "EXPIRED");
    });

    it("returns PROOF_SUBMITTED unchanged even when past deadline", async () => {
      const sdk = createSdk({
        contractTask: makeTask({ status: 3n, deadlineMs: PAST_MS }),
        currentTimeMs: PAST_MS + 1n
      });
      assert.equal(await sdk.getTaskStatus(TASK_ID), "PROOF_SUBMITTED");
    });

    it("returns VERIFIED_PASS when a verification report exists and passed is true", async () => {
      const fakeSignature = "0x" + "ab".repeat(65);
      const reportWithSig = {
        ...(reportFixtureObject as object),
        signature: fakeSignature
      };
      const sdk = createSdk({
        contractTask: makeTask({ reportHash: reportFixtureHash, status: 3n }),
        reportResolver: {
          async getReport() {
            return reportWithSig as unknown as VerificationReport;
          }
        }
      });
      assert.equal(await sdk.getTaskStatus(TASK_ID), "VERIFIED_PASS");
    });
  });

  describe("ready", () => {
    it("returns signer and network readiness details", async () => {
      const sdk = createSdk();
      const ready = await sdk.ready();
      assert.equal(ready.signerAddress, BUYER);
      assert.equal(ready.chainId, "31337");
      assert.equal(ready.settlementAddress, SETTLEMENT);
    });
  });

  // ── getReport ─────────────────────────────────────────────────────

  describe("getReport", () => {
    it("returns null report when task has no reportHash", async () => {
      const sdk = createSdk({ contractTask: makeTask({ reportHash: ZERO_HASH }) });
      const record = await sdk.getReport(TASK_ID);
      assert.equal(record.reportHash, null);
      assert.equal(record.report, null);
    });

    it("returns null report when no reportResolver is configured", async () => {
      const someHash = "0x1234123412341234123412341234123412341234123412341234123412341234";
      const sdk = createSdk({ contractTask: makeTask({ reportHash: someHash, status: 4n }) });
      const record = await sdk.getReport(TASK_ID);
      assert.equal(record.reportHash, someHash);
      assert.equal(record.report, null);
    });

    it("throws BuyerSdkValidationError when resolved report hash mismatches on-chain hash", async () => {
      const wrongHash = "0x9999999999999999999999999999999999999999999999999999999999999999";
      const fakeSignature = "0x" + "ab".repeat(65);
      const reportWithSig = {
        ...(reportFixtureObject as object),
        signature: fakeSignature
      };
      const sdk = createSdk({
        contractTask: makeTask({ reportHash: wrongHash, status: 4n }),
        reportResolver: {
          async getReport() {
            return reportWithSig as unknown as VerificationReport;
          }
        }
      });
      await assert.rejects(
        () => sdk.getReport(TASK_ID),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          return true;
        }
      );
    });

    it("returns the report when hash matches on-chain reportHash", async () => {
      const fakeSignature = "0x" + "ab".repeat(65);
      const reportWithSig = {
        ...(reportFixtureObject as object),
        signature: fakeSignature
      };
      const sdk = createSdk({
        contractTask: makeTask({ reportHash: reportFixtureHash, status: 4n }),
        reportResolver: {
          async getReport() {
            return reportWithSig as unknown as VerificationReport;
          }
        }
      });
      const record = await sdk.getReport(TASK_ID);
      assert.equal(record.reportHash, reportFixtureHash);
      assert.ok(record.report !== null);
    });
  });

  // ── validateCommitment – structural checks ────────────────────────

  describe("validateCommitment – structural checks", () => {
    it("throws BuyerSdkConfigurationError when no storage is configured", async () => {
      const sdk = createSdk({ storage: undefined });
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkConfigurationError");
          return true;
        }
      );
    });

    it("throws when commitment.taskId does not match the task taskId", async () => {
      const { storage, pointer } = await makeCommitmentSdk();
      const altTaskId = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      const sdk = createSdk({
        storage,
        contractTask: makeTask({
          taskId: altTaskId,
          commitmentHash: pointer.hash,
          commitmentURI: pointer.uri
        })
      });
      await assert.rejects(
        () => sdk.validateCommitment(altTaskId),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /taskId/);
          return true;
        }
      );
    });

    it("throws when commitment.buyer does not match the task buyer", async () => {
      const { storage, pointer } = await makeCommitmentSdk();
      const sdk = createSdk({
        storage,
        contractTask: makeTask({
          buyer: "0x8888888888888888888888888888888888888888",
          commitmentHash: pointer.hash,
          commitmentURI: pointer.uri
        })
      });
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /buyer/);
          return true;
        }
      );
    });

    it("throws when commitment.seller does not match the task seller", async () => {
      const { storage, pointer } = await makeCommitmentSdk();
      const sdk = createSdk({
        storage,
        contractTask: makeTask({
          seller: "0x9999999999999999999999999999999999999999",
          commitmentHash: pointer.hash,
          commitmentURI: pointer.uri
        })
      });
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /seller/);
          return true;
        }
      );
    });

    it("throws when commitment deadline exceeds the task deadline", async () => {
      const { storage, pointer } = await makeCommitmentSdk();
      const commitmentDeadline = BigInt(commitmentFixture.object.deadline);
      const sdk = createSdk({
        storage,
        contractTask: makeTask({
          deadlineMs: commitmentDeadline - 1n,
          commitmentHash: pointer.hash,
          commitmentURI: pointer.uri
        })
      });
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /deadline/);
          return true;
        }
      );
    });
  });

  // ── validateCommitment – expectation checks ───────────────────────

  describe("validateCommitment – expectation checks", () => {
    it("throws when commitment host is not in acceptedHosts", async () => {
      const { sdk } = await makeCommitmentSdk();
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID, { acceptedHosts: ["api.anthropic.com"] }),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /host/);
          return true;
        }
      );
    });

    it("throws when commitment model is not in acceptedModels", async () => {
      const { sdk } = await makeCommitmentSdk();
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID, { acceptedModels: ["gpt-4o"] }),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /model/i);
          return true;
        }
      );
    });

    it("throws when commitment verifier does not match expectedVerifier", async () => {
      const { sdk } = await makeCommitmentSdk();
      await assert.rejects(
        () =>
          sdk.validateCommitment(TASK_ID, {
            expectedVerifier: "0x8888888888888888888888888888888888888888"
          }),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /verifier/);
          return true;
        }
      );
    });

    it("throws when commitment is already expired relative to nowMs", async () => {
      const { sdk } = await makeCommitmentSdk();
      const afterDeadline = (BigInt(commitmentFixture.object.deadline) + 1n).toString();
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID, { nowMs: afterDeadline }),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /expired/);
          return true;
        }
      );
    });

    it("throws when requireNonZeroMinUsage is true and totalTokens is zero", async () => {
      const { sdk } = await makeCommitmentSdk({ minUsage: { totalTokens: 0 } });
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID, { requireNonZeroMinUsage: true }),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /minUsage/);
          return true;
        }
      );
    });

    it("throws when minTotalTokens exceeds the commitment minUsage.totalTokens", async () => {
      // Fixture commitment has minUsage.totalTokens = 120
      const { sdk } = await makeCommitmentSdk();
      await assert.rejects(
        () => sdk.validateCommitment(TASK_ID, { minTotalTokens: 999 }),
        (err: Error) => {
          assert.equal(err.constructor.name, "BuyerSdkValidationError");
          assert.match(err.message, /minUsage/);
          return true;
        }
      );
    });

    it("passes and returns ValidatedCommitment when all expectations are satisfied", async () => {
      const { sdk } = await makeCommitmentSdk();
      const result = await sdk.validateCommitment(TASK_ID, {
        acceptedHosts: ["api.openai.com"],
        acceptedModels: ["gpt-4o-mini"],
        expectedVerifier: VERIFIER
      });
      assert.equal(result.commitment.taskId, TASK_ID);
      assert.equal(result.commitment.allowedModels[0], "gpt-4o-mini");
      assert.equal(result.expectationsApplied.requireNonZeroMinUsage, false);
    });

    it("passes when acceptedHosts list is empty (no host filter applied)", async () => {
      const { sdk } = await makeCommitmentSdk();
      const result = await sdk.validateCommitment(TASK_ID, { acceptedHosts: [] });
      assert.equal(result.commitment.taskId, TASK_ID);
    });
  });
});
