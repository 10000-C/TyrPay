---
name: tyrpay-seller-skill
description: Seller-side TyrPay workflow for LLM agents. Accept tasks, execute zkTLS-proven API calls, submit proof bundles, and monitor settlement.
---

# TyrPay Seller Skill

Use this skill when an agent needs to act as the seller in a TyrPay payment flow.
It assumes the runtime already has a configured `SellerAgent`, a readable settlement
contract, and access to the `@tyrpay/seller-skill` tool set.

## Quick Start

1. Install `@tyrpay/seller-skill`, `@tyrpay/seller-sdk`, a storage adapter, and a zkTLS adapter.
2. Construct `SellerAgent` with a signer, settlement address, chain ID, storage adapter, and zkTLS adapter.
3. Register `createSellerTools({ agent, contract, verifier })` with your tool-calling runtime.
4. Call `tyrpay_ready` before the first task workflow.
5. Use `tyrpay_accept_task` when you receive a `taskId` from a buyer.

## When To Use

- The agent is responsible for accepting and executing TyrPay tasks as a seller.
- The agent must produce zkTLS-backed proofs of upstream API calls.
- The agent needs structured task state that is safe to show to an end user.
- The seller workflow must remain non-blocking and recoverable after network interruptions.

## Workflow

1. Run `tyrpay_ready` to verify signer access and storage adapter connectivity.
2. When a buyer shares a `taskId`, call `tyrpay_accept_task` with your execution terms.
3. Wait for the buyer to fund the task (poll with `tyrpay_check_settlement`).
4. Once funded, call `tyrpay_execute_task` for each required upstream API call.
5. Collect the returned receipts and call `tyrpay_submit_proof` with the full set.
6. Use `tyrpay_check_settlement` to monitor whether verification released payment.

## Tooling Notes

- All tools reject malformed inputs with structured `SellerSkillToolError` errors.
- `tyrpay_accept_task` reads the on-chain task to derive buyer and verifier addresses.
- `tyrpay_execute_task` requires the `commitment` object returned by `tyrpay_accept_task`.
- `tyrpay_submit_proof` requires all receipts collected from `tyrpay_execute_task` calls.
- Seller-facing statuses include `PAID` on successful settlement and `NOT_PAID_REFUNDED` on refund.

## Resources

- `references/tool-reference.md` for the tool contract and status model.
