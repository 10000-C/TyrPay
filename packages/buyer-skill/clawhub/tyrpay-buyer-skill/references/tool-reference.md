# Tool Reference

## Exported Tools

- `tyrpay_ready`: checks buyer signer and provider reachability.
- `tyrpay_post_task`: creates a task and optionally waits for seller commitment and funds it. **`expectations` is required** unless `createOnly: true`.
- `tyrpay_fund_task`: funds a task that already has a seller commitment. **`expectations` is required.**
- `tyrpay_check_task`: returns the normalized task plus derived and buyer-facing status.
- `tyrpay_list_tasks`: batch status lookup for 1 to 20 task IDs with bounded concurrency.
- `tyrpay_refund_task`: starts a refund on timeout paths.

## Operational Guarantees

- Runtime input validation runs before SDK or ethers calls.
- Validation failures surface as `BuyerSkillToolError` with stable fields:
  `code`, `message`, `field`, `received`, `suggestion`, `retryable`, `causeName`.
- Seller wait timeout after task creation returns a structured result with:
  `taskId`, `taskNonce`, `createTxHash`, `timedOut`, `userStatus`, `userMessage`.
- Manual funding uses a single commitment validation pass.
- Funding calls without `expectations` are rejected at the validation layer.

## Mandatory Expectations

The settlement contract does **not** validate that the seller's commitment matches the buyer's intent.
To prevent funding under unintended terms, the skill layer **requires** `expectations` on every funding path:
- `tyrpay_fund_task` rejects calls that omit `expectations`.
- `tyrpay_post_task` rejects calls that omit `expectations` when `createOnly` is not `true`.

The SDK checks host, path, models, minimum usage, verifier, and deadline **before** locking payment.

## Buyer-Facing Statuses

- `WAITING_FOR_SELLER`
- `READY_TO_FUND`
- `IN_PROGRESS`
- `AWAITING_VERIFICATION`
- `VERIFIED_PASS`
- `VERIFIED_FAIL`
- `COMPLETED`
- `REFUNDED`
- `EXPIRED`
- `REFUND_IN_PROGRESS`
