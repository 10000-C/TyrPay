import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DerivedTaskStatus } from "@tyrpay/sdk-core";
import { BuyerSkillToolError, createBuyerTools } from "../src/index.js";
import type { FundTaskResult, PostTaskResult } from "../src/index.js";

const TASK_ID = "0x" + "a".repeat(64);
const TASK_NONCE = "0x" + "b".repeat(64);
const SELLER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const COMMITMENT_HASH = "0x" + "c".repeat(64);

function createMockSdk() {
  let validateCount = 0;
  const signer = {
    getAddress: async () => "0x3333333333333333333333333333333333333333",
    provider: {
      getNetwork: async () => ({ chainId: 31337n })
    }
  };

  const sdk = {
    config: { signer },
    async createTaskIntent() {
      return {
        taskId: TASK_ID,
        taskNonce: TASK_NONCE,
        receipt: { hash: "0xcreate" }
      };
    },
    async getTask() {
      return {
        taskId: TASK_ID,
        taskNonce: TASK_NONCE,
        buyer: "0x3333333333333333333333333333333333333333",
        seller: SELLER,
        token: TOKEN,
        amount: "1000",
        deadline: "1760000000000",
        commitmentHash: COMMITMENT_HASH,
        commitmentURI: "memory://commitment",
        fundedAt: null,
        proofBundleHash: null,
        proofBundleURI: null,
        proofSubmittedAt: null,
        reportHash: null,
        settledAt: null,
        refundedAt: null,
        status: "COMMITMENT_SUBMITTED",
        statusCode: 1
      };
    },
    async getTaskStatus(): Promise<DerivedTaskStatus> {
      return "COMMITMENT_SUBMITTED";
    },
    async ready() {
      return {
        signerAddress: "0x3333333333333333333333333333333333333333",
        chainId: "31337",
        settlementAddress: "0x4444444444444444444444444444444444444444"
      };
    },
    async validateCommitment() {
      validateCount += 1;
      return {
        task: await this.getTask(),
        commitmentHash: COMMITMENT_HASH,
        commitmentURI: "memory://commitment",
        commitment: {} as never,
        expectationsApplied: { requireNonZeroMinUsage: false }
      };
    },
    async fundTask() {
      return { hash: "0xfund" };
    },
    async refundAfterProofSubmissionDeadline() {
      return { hash: "0xrefund-proof" };
    },
    async refundAfterVerificationTimeout() {
      return { hash: "0xrefund-verify" };
    }
  };

  return {
    sdk,
    getValidateCount: () => validateCount
  };
}

describe("buyer-skill", () => {
  it("wraps invalid post_task input as BuyerSkillToolError", async () => {
    const tool = createBuyerTools(createMockSdk().sdk as never).find((entry) => entry.name === "tyrpay_post_task");

    assert.ok(tool);

    await assert.rejects(
      () =>
        tool.execute({
          seller: "not-an-address",
          token: TOKEN,
          amount: "1000",
          deadline: "1760000000000"
        }),
      (error: Error) => {
        assert.equal(error.constructor.name, "BuyerSkillToolError");
        const typed = error as BuyerSkillToolError;
        assert.equal(typed.code, "VALIDATION_ERROR");
        assert.equal(typed.field, "seller");
        return true;
      }
    );
  });

  it("supports createOnly flow without funding", async () => {
    const tool = createBuyerTools(createMockSdk().sdk as never).find((entry) => entry.name === "tyrpay_post_task");

    assert.ok(tool);

    const result = (await tool.execute({
      seller: SELLER,
      token: TOKEN,
      amount: "1000",
      deadline: "1760000000000",
      createOnly: true
    })) as PostTaskResult;

    assert.equal("fundTxHash" in result, false);
    assert.equal(result.userStatus, "WAITING_FOR_SELLER");
  });

  it("exposes manual funding as a separate tool", async () => {
    const { sdk, getValidateCount } = createMockSdk();
    const tool = createBuyerTools(sdk as never).find((entry) => entry.name === "tyrpay_fund_task");

    assert.ok(tool);

    const result = (await tool.execute({ taskId: TASK_ID })) as FundTaskResult;
    assert.equal(result.fundTxHash, "0xfund");
    assert.equal(result.userStatus, "IN_PROGRESS");
    assert.equal(getValidateCount(), 1);
  });

  it("rejects list_tasks requests beyond the declared batch size", async () => {
    const tool = createBuyerTools(createMockSdk().sdk as never).find((entry) => entry.name === "tyrpay_list_tasks");

    assert.ok(tool);

    const taskIds = Array.from({ length: 21 }, (_, index) => `0x${String(index + 1).padStart(64, "0")}`);

    await assert.rejects(
      () => tool.execute({ taskIds }),
      (error: Error) => {
        const typed = error as BuyerSkillToolError;
        assert.equal(typed.code, "VALIDATION_ERROR");
        assert.equal(typed.field, "taskIds");
        return true;
      }
    );
  });

  it("maps VERIFIED_PASS into a buyer-facing verification status", async () => {
    const { sdk } = createMockSdk();
    sdk.getTaskStatus = async () => "VERIFIED_PASS" as const;
    const tool = createBuyerTools(sdk as never).find((entry) => entry.name === "tyrpay_check_task");

    assert.ok(tool);

    const result = await tool.execute({ taskId: TASK_ID });
    assert.equal((result as { userStatus: string }).userStatus, "VERIFIED_PASS");
  });
});
