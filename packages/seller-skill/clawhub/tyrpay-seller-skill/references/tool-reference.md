# Tool Reference

## Exported Tools

- `tyrpay_ready`: checks seller signer reachability and storage adapter configuration.
- `tyrpay_accept_task`: builds execution commitment, uploads it, and submits on-chain.
- `tyrpay_execute_task`: performs a zkTLS-proven API call and returns a delivery receipt.
- `tyrpay_submit_proof`: assembles receipts into a proof bundle and submits on-chain.
- `tyrpay_check_settlement`: returns raw protocol status and seller-facing payout status.

## Operational Guarantees

- Runtime input validation runs before SDK or on-chain calls.
- Validation failures surface as `SellerSkillToolError` with stable fields:
  `code`, `message`, `field`, `received`, `suggestion`, `retryable`, `causeName`.
- `tyrpay_accept_task` reads the on-chain task record to validate task existence before submission.
- `tyrpay_execute_task` validates that `request.host`, `request.path`, and `request.method` match the commitment target.
- `tyrpay_submit_proof` verifies storage hash integrity after upload.

## Seller-Facing Statuses

- `READY_TO_ACCEPT`: buyer created the task, waiting for seller commitment.
- `WAITING_FOR_BUYER_FUNDING`: commitment submitted, waiting for buyer to lock payment.
- `READY_TO_EXECUTE`: payment locked, seller can execute the task.
- `PROOF_CAPTURED`: execution proof captured, ready to submit.
- `AWAITING_VERIFICATION`: proof submitted, waiting for verifier.
- `PAID`: task settled, payment released to seller.
- `NOT_PAID_REFUNDED`: task refunded to buyer, no seller payout.
