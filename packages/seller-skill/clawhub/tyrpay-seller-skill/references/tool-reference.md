# Tool Reference

## Exported Tools

- `tyrpay_ready`: checks seller signer reachability and storage adapter configuration.
- `tyrpay_discover_model_endpoint`: given a model, discovers matching reachable TeeTLS/TeeML endpoints and returns host/path/model/providerOptions for the seller workflow.
- `tyrpay_accept_task`: builds execution commitment, uploads it, and submits on-chain.
- `tyrpay_execute_task`: performs a zkTLS-proven API call and returns a delivery receipt.
- `tyrpay_submit_proof`: assembles receipts into a proof bundle and submits on-chain.
- `tyrpay_check_settlement`: returns raw protocol status and seller-facing payout status.

## Operational Guarantees

- Runtime input validation runs before SDK or on-chain calls.
- Validation failures surface as `SellerSkillToolError` with stable fields:
  `code`, `message`, `field`, `received`, `suggestion`, `retryable`, `causeName`.
- `tyrpay_accept_task` reads the on-chain task record to validate task existence before submission.
- `ExecutionCommitment.verifier` is the registry-authorized verifier signer
  address that signs `VerificationReport`; it is not a verifier contract address.
- `tyrpay_execute_task` validates that `request.host`, `request.path`, and `request.method` match the commitment target.
- With provider `"0g-teetls"`, the commitment target/model must be the actual
  0G TeeTLS endpoint/model resolved by the adapter. A commitment to a generic
  upstream endpoint or different model is invalid for TeeTLS execution.
- Use `tyrpay_discover_model_endpoint` before accepting a task when the seller
  only has a target model. Its `recommended.host`, `recommended.path`,
  `recommended.method`, and `recommended.model` are commitment inputs; its
  `recommended.providerOptions` should be forwarded to `tyrpay_execute_task`.
- `tyrpay_submit_proof` verifies storage hash integrity after upload.

## Integration Requirements

- The settlement contract ABI must match the current `TyrPaySettlement.Task`
  struct order: `taskId`, `taskNonce`, `buyer`, `seller`, `token`, `amount`,
  `deadlineMs`, `requiredMinUsage`, `requiredModelsHash`, `commitmentHash`,
  `commitmentURI`, `fundedAtMs`, `proofBundleHash`, `proofBundleURI`,
  `proofSubmittedAtMs`, `reportHash`, `settledAtMs`, `refundedAtMs`, `status`.
- `MemoryStorageAdapter` and `memory://` URIs are valid only for local tests in
  one process. Production or cross-agent flows need persistent retrievable
  storage.
- `commitmentHash` is the canonical hash of the complete
  `ExecutionCommitment`. It cannot be recomputed from task fields alone.
- Reclaim proof generation requires runtime installation of optional Reclaim
  peer dependencies, credentials, and zk resource files.

## Seller-Facing Statuses

- `READY_TO_ACCEPT`: buyer created the task, waiting for seller commitment.
- `WAITING_FOR_BUYER_FUNDING`: commitment submitted, waiting for buyer to lock payment.
- `READY_TO_EXECUTE`: payment locked, seller can execute the task.
- `PROOF_CAPTURED`: execution proof captured, ready to submit.
- `AWAITING_VERIFICATION`: proof submitted, waiting for verifier.
- `PAID`: task settled, payment released to seller.
- `NOT_PAID_REFUNDED`: task refunded to buyer, no seller payout.
