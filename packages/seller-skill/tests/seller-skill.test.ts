import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SellerSkillToolError, createSellerTools } from "../src/index.js";
import type { AcceptTaskResult, ReadyResult } from "../src/index.js";

const TASK_ID = "0x" + "a".repeat(64);
const TASK_NONCE = "0x" + "b".repeat(64);
const SELLER = "0x1111111111111111111111111111111111111111";
const BUYER = "0x2222222222222222222222222222222222222222";
const VERIFIER = "0x3333333333333333333333333333333333333333";
const COMMITMENT_HASH = "0x" + "c".repeat(64);
const ZERO_HASH = "0x" + "0".repeat(64);

function createMockAgent() {
  return {
    signer: {
      getAddress: async () => SELLER
    },
    storageAdapter: {
      putObject: async () => ({ uri: "memory://commitment", hash: COMMITMENT_HASH })
    },
    async submitCommitment() {
      return {
        txHash: "0xsubmit",
        taskId: TASK_ID,
        commitmentHash: COMMITMENT_HASH,
        commitmentURI: "memory://commitment"
      };
    },
    async provenFetch() {
      return {
        receipt: { taskId: TASK_ID },
        receiptPointer: { uri: "memory://receipt", hash: "0xreceipt" + "a".repeat(56) },
        rawProof: {},
        rawProofPointer: { uri: "memory://proof", hash: "0xproof" + "a".repeat(56) }
      };
    },
    buildProofBundle() {
      return {
        taskId: TASK_ID,
        commitmentHash: COMMITMENT_HASH,
        seller: SELLER,
        receipts: [],
        aggregateUsage: { totalTokens: 100 },
        createdAt: "1760000000000"
      };
    },
    async uploadProofBundle() {
      return {
        pointer: { uri: "memory://bundle", hash: "0xbundle" + "a".repeat(56) },
        bundle: {}
      };
    },
    async submitProofBundleHash() {
      return {
        txHash: "0xproof-submit",
        taskId: TASK_ID,
        proofBundleHash: "0xbundle" + "a".repeat(56),
        proofBundleURI: "memory://bundle"
      };
    }
  };
}

function createMockContract(taskOverrides: Partial<Record<string, unknown>> = {}) {
  return {
    async getTask() {
      return {
        taskId: TASK_ID,
        taskNonce: TASK_NONCE,
        buyer: BUYER,
        seller: SELLER,
        token: "0xtoken" + "a".repeat(56),
        amount: 1000n,
        deadlineMs: 1760000000000n,
        commitmentHash: COMMITMENT_HASH,
        commitmentURI: "memory://commitment",
        fundedAtMs: 1759000000000n,
        proofBundleHash: ZERO_HASH,
        proofBundleURI: "",
        proofSubmittedAtMs: 0n,
        reportHash: ZERO_HASH,
        settledAtMs: 0n,
        refundedAtMs: 0n,
        status: 2,
        ...taskOverrides
      };
    },
    async submitCommitment() {
      return { hash: "0xsubmit", wait: async () => {} };
    },
    async submitProofBundle() {
      return { hash: "0xproof-submit", wait: async () => {} };
    }
  };
}

function createTestTools(taskOverrides: Partial<Record<string, unknown>> = {}) {
  const agent = createMockAgent();
  const contract = createMockContract(taskOverrides);
  const tools = createSellerTools({
    agent: agent as never,
    contract: contract as never,
    verifier: VERIFIER
  });
  return { agent, contract, tools };
}

describe("seller-skill", () => {
  it("exports 5 tools including tyrpay_ready", () => {
    const { tools } = createTestTools();
    assert.equal(tools.length, 5);
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("tyrpay_ready"));
    assert.ok(names.includes("tyrpay_accept_task"));
    assert.ok(names.includes("tyrpay_execute_task"));
    assert.ok(names.includes("tyrpay_submit_proof"));
    assert.ok(names.includes("tyrpay_check_settlement"));
  });

  // --- tyrpay_ready ---

  it("tyrpay_ready returns signer address on success", async () => {
    const { tools } = createTestTools();
    const ready = tools.find((t) => t.name === "tyrpay_ready");
    assert.ok(ready);

    const result = (await ready.execute({})) as ReadyResult;
    assert.equal(result.ok, true);
    assert.equal(result.userStatus, "READY");
    assert.equal(result.signerAddress, SELLER);
  });

  it("tyrpay_ready rejects non-empty input", async () => {
    const { tools } = createTestTools();
    const ready = tools.find((t) => t.name === "tyrpay_ready");
    assert.ok(ready);

    await assert.rejects(
      () => ready.execute({ extra: true }),
      (error: Error) => {
        assert.equal(error.constructor.name, "SellerSkillToolError");
        const typed = error as SellerSkillToolError;
        assert.equal(typed.code, "VALIDATION_ERROR");
        assert.equal(typed.field, "input");
        return true;
      }
    );
  });

  // --- Validation errors ---

  it("wraps invalid accept_task taskId as SellerSkillToolError", async () => {
    const { tools } = createTestTools();
    const tool = tools.find((t) => t.name === "tyrpay_accept_task");
    assert.ok(tool);

    await assert.rejects(
      () =>
        tool.execute({
          taskId: "bad-id",
          host: "api.openai.com",
          path: "/v1/chat/completions",
          method: "POST",
          allowedModels: ["gpt-4o-mini"],
          minTotalTokens: 500,
          deadline: "1760000000000"
        }),
      (error: Error) => {
        assert.equal(error.constructor.name, "SellerSkillToolError");
        const typed = error as SellerSkillToolError;
        assert.equal(typed.code, "VALIDATION_ERROR");
        assert.equal(typed.field, "taskId");
        return true;
      }
    );
  });

  it("wraps missing required field as validation error", async () => {
    const { tools } = createTestTools();
    const tool = tools.find((t) => t.name === "tyrpay_accept_task");
    assert.ok(tool);

    await assert.rejects(
      () =>
        tool.execute({
          taskId: TASK_ID,
          host: "api.openai.com"
          // missing required fields
        }),
      (error: Error) => {
        assert.equal(error.constructor.name, "SellerSkillToolError");
        const typed = error as SellerSkillToolError;
        assert.equal(typed.code, "VALIDATION_ERROR");
        return true;
      }
    );
  });

  it("rejects unexpected fields in accept_task input", async () => {
    const { tools } = createTestTools();
    const tool = tools.find((t) => t.name === "tyrpay_accept_task");
    assert.ok(tool);

    await assert.rejects(
      () =>
        tool.execute({
          taskId: TASK_ID,
          host: "api.openai.com",
          path: "/v1/chat/completions",
          method: "POST",
          allowedModels: ["gpt-4o-mini"],
          minTotalTokens: 500,
          deadline: "1760000000000",
          extraField: "unexpected"
        }),
      (error: Error) => {
        assert.equal(error.constructor.name, "SellerSkillToolError");
        const typed = error as SellerSkillToolError;
        assert.equal(typed.code, "VALIDATION_ERROR");
        assert.ok(typed.field?.includes("extraField"));
        return true;
      }
    );
  });

  it("rejects empty allowedModels array", async () => {
    const { tools } = createTestTools();
    const tool = tools.find((t) => t.name === "tyrpay_accept_task");
    assert.ok(tool);

    await assert.rejects(
      () =>
        tool.execute({
          taskId: TASK_ID,
          host: "api.openai.com",
          path: "/v1/chat/completions",
          method: "POST",
          allowedModels: [],
          minTotalTokens: 500,
          deadline: "1760000000000"
        }),
      (error: Error) => {
        assert.equal(error.constructor.name, "SellerSkillToolError");
        const typed = error as SellerSkillToolError;
        assert.equal(typed.code, "VALIDATION_ERROR");
        assert.equal(typed.field, "allowedModels");
        return true;
      }
    );
  });

  // --- Status mapping ---

  it("maps FUNDED to READY_TO_EXECUTE in check_settlement", async () => {
    const { tools } = createTestTools({ status: 2 });
    const tool = tools.find((t) => t.name === "tyrpay_check_settlement");
    assert.ok(tool);

    const result = await tool.execute({ taskId: TASK_ID });
    const typed = result as { userStatus: string; status: string };
    assert.equal(typed.status, "FUNDED");
    assert.equal(typed.userStatus, "READY_TO_EXECUTE");
  });

  it("maps SETTLED to PAID in check_settlement", async () => {
    const { tools } = createTestTools({
      status: 4,
      settledAtMs: 1760000000000n
    });
    const tool = tools.find((t) => t.name === "tyrpay_check_settlement");
    assert.ok(tool);

    const result = await tool.execute({ taskId: TASK_ID });
    const typed = result as { userStatus: string; settled: boolean; settledAt: string | null };
    assert.equal(typed.userStatus, "PAID");
    assert.equal(typed.settled, true);
    assert.ok(typed.settledAt);
  });

  it("maps REFUNDED to NOT_PAID_REFUNDED in check_settlement", async () => {
    const { tools } = createTestTools({
      status: 5,
      refundedAtMs: 1760000000000n
    });
    const tool = tools.find((t) => t.name === "tyrpay_check_settlement");
    assert.ok(tool);

    const result = await tool.execute({ taskId: TASK_ID });
    const typed = result as { userStatus: string; refunded: boolean };
    assert.equal(typed.userStatus, "NOT_PAID_REFUNDED");
    assert.equal(typed.refunded, true);
  });

  // --- Accept task flow ---

  it("tyrpay_accept_task returns commitment and WAITING_FOR_BUYER_FUNDING", async () => {
    const { tools } = createTestTools();
    const tool = tools.find((t) => t.name === "tyrpay_accept_task");
    assert.ok(tool);

    const result = (await tool.execute({
      taskId: TASK_ID,
      host: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      allowedModels: ["gpt-4o-mini"],
      minTotalTokens: 500,
      deadline: "1760000000000"
    })) as AcceptTaskResult;

    assert.equal(result.userStatus, "WAITING_FOR_BUYER_FUNDING");
    assert.equal(result.taskId, TASK_ID);
    assert.ok(result.txHash);
    assert.ok(result.commitment);
  });

  // --- Error wrapping ---

  it("wraps on-chain errors as SellerSkillToolError", async () => {
    const agent = createMockAgent();
    agent.signer.getAddress = async () => {
      throw new Error("NETWORK_ERROR: provider not connected");
    };
    const contract = createMockContract();
    const tools = createSellerTools({
      agent: agent as never,
      contract: contract as never,
      verifier: VERIFIER
    });
    const ready = tools.find((t) => t.name === "tyrpay_ready");
    assert.ok(ready);

    await assert.rejects(
      () => ready.execute({}),
      (error: Error) => {
        assert.equal(error.constructor.name, "SellerSkillToolError");
        const typed = error as SellerSkillToolError;
        assert.equal(typed.code, "NETWORK_ERROR");
        assert.equal(typed.retryable, true);
        return true;
      }
    );
  });

  // --- SellerSkillToolError.toJSON ---

  it("SellerSkillToolError.toJSON returns all fields", () => {
    const error = new SellerSkillToolError({
      code: "VALIDATION_ERROR",
      message: "bad input",
      field: "taskId",
      received: "bad-id",
      suggestion: "Fix it.",
      retryable: false
    });

    const json = error.toJSON();
    assert.equal(json.code, "VALIDATION_ERROR");
    assert.equal(json.message, "bad input");
    assert.equal(json.field, "taskId");
    assert.equal(json.received, "bad-id");
    assert.equal(json.suggestion, "Fix it.");
    assert.equal(json.retryable, false);
    assert.equal(json.causeName, undefined);
  });
});
