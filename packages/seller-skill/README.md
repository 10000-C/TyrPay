# @tyrpay/seller-skill

LLM-callable seller-side tools for the TyrPay Phase 1 protocol.

This package wraps a configured `SellerAgent` plus a readable settlement
contract into structured tool definitions that an agent can execute directly.

## What This Package Exports

- `createSellerTools(config)`: returns five seller-side tools
- `SellerSkillToolError`: structured error class with `code`, `field`, `suggestion`, `retryable`
- `SellerTool`: the shared tool shape used by this package
- `ReadableContractLike`: the read/write contract interface expected by the tools
- `SellerSkillConfig`: configuration shape for `createSellerTools`

Tool names:

- `tyrpay_ready`
- `tyrpay_accept_task`
- `tyrpay_execute_task`
- `tyrpay_submit_proof`
- `tyrpay_check_settlement`

## Installation

```bash
pnpm add @tyrpay/seller-skill @tyrpay/seller-sdk @tyrpay/storage-adapter @tyrpay/zktls-adapter
```

This package assumes you already have a configured `SellerAgent`.

## End-to-End Flow

Typical seller-side flow:

1. Call `tyrpay_ready` to verify signer access and storage adapter connectivity.
2. Receive a `taskId` from the buyer through your own application or messaging layer.
3. Call `tyrpay_accept_task` to build and submit the execution commitment.
4. Wait for the buyer to validate that commitment and fund the task.
   Poll with `tyrpay_check_settlement` until status is `READY_TO_EXECUTE`.
5. Read the funded task from the settlement contract and obtain its `taskNonce`.
6. Call `tyrpay_execute_task` once per proved upstream API call.
7. Keep each returned receipt.
8. Call `tyrpay_submit_proof` with the commitment and collected receipts.
9. Use `tyrpay_check_settlement` to monitor whether the verifier settled or refunded the task.

`seller-skill` does not discover tasks, coordinate with the buyer, or operate a
verifier. Those responsibilities stay outside this package.

## Prerequisites

Before calling `createSellerTools`, prepare:

- a seller wallet signer connected to a provider
- the TyrPay settlement contract address
- the target chain ID
- a storage adapter
- a zkTLS adapter
- a contract instance that supports:
  - `submitCommitment`
  - `submitProofBundle`
  - `getTask`
- the verifier address that should be embedded into commitments

Minimal `SellerAgent` setup:

```ts
import { SellerAgent } from "@tyrpay/seller-sdk";
import { MemoryStorageAdapter } from "@tyrpay/storage-adapter";
import { ReclaimZkTlsAdapter } from "@tyrpay/zktls-adapter";

const agent = new SellerAgent({
  signer,
  settlementContract,
  chainId,
  storageAdapter: new MemoryStorageAdapter(),
  zkTlsAdapter: new ReclaimZkTlsAdapter({
    appId: process.env.RECLAIM_APP_ID,
    appSecret: process.env.RECLAIM_APP_SECRET
  })
});
```

## Basic Usage

### Raw tool definitions

```ts
import { createSellerTools } from "@tyrpay/seller-skill";

const tools = createSellerTools({
  agent,
  contract,
  verifier: verifierAddress
});
```

Each returned tool has:

- `name`
- `description`
- `inputSchema`
- `execute(input)`

### Claude-style tool format

```ts
const claudeTools = createSellerTools({
  agent,
  contract,
  verifier: verifierAddress
}).map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema
}));
```

### OpenAI-style tool format

```ts
const openAITools = createSellerTools({
  agent,
  contract,
  verifier: verifierAddress
}).map((tool) => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  }
}));
```

### Executing a returned tool call

```ts
const tools = createSellerTools({
  agent,
  contract,
  verifier: verifierAddress
});

const acceptTask = tools.find((entry) => entry.name === "tyrpay_accept_task");

if (!acceptTask) {
  throw new Error("seller tool not found");
}

const accepted = await acceptTask.execute({
  taskId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  host: "api.openai.com",
  path: "/v1/chat/completions",
  method: "POST",
  allowedModels: ["gpt-4o-mini"],
  minTotalTokens: 500,
  deadline: "1760000000000"
});
```

## Error Handling

All tools wrap errors in `SellerSkillToolError`, which provides structured fields:

- `code`: one of `VALIDATION_ERROR`, `CONFIGURATION_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, `UNKNOWN_ERROR`
- `message`: human-readable error description
- `field`: the input field that caused the error (for validation errors)
- `received`: the actual value that was rejected
- `suggestion`: guidance on how to fix the error
- `retryable`: whether the operation can be retried
- `causeName`: the underlying error class name

```ts
import { SellerSkillToolError } from "@tyrpay/seller-skill";

try {
  await acceptTask.execute({ taskId: "bad-id" });
} catch (error) {
  if (error instanceof SellerSkillToolError) {
    console.log(error.code);       // "VALIDATION_ERROR"
    console.log(error.field);      // "taskId"
    console.log(error.suggestion); // "Fix the tool arguments and try again."
    console.log(error.retryable);  // false
  }
}
```

## Tool Semantics

### `tyrpay_ready`

Lightweight readiness check that verifies the seller signer is reachable.

Call this before the first task workflow to fail fast on misconfiguration.

Returns:

- `ok`: always `true` on success
- `signerAddress`: the seller's wallet address
- `userStatus`: `READY`
- `userMessage`: confirmation that signer is reachable

### `tyrpay_accept_task`

Builds the `ExecutionCommitment`, uploads it through the configured storage
adapter, and submits its hash/URI on-chain.

Call this after the buyer has shared a `taskId`.

Returns:

- `txHash`: transaction hash for `submitCommitment`
- `taskId`: task identifier bound into the commitment
- `commitmentHash`: hash of the submitted commitment
- `commitmentURI`: storage URI of the submitted commitment
- `commitment`: the fully constructed `ExecutionCommitment` object
- `userStatus`: currently `WAITING_FOR_BUYER_FUNDING`
- `userMessage`: seller-facing explanation of what happens next

### `tyrpay_execute_task`

Runs one zkTLS-proven upstream API call using the supplied commitment, request,
task nonce, and declared model.

Returns:

- `receipt`: normalized `DeliveryReceipt`
- `receiptURI`: storage URI for the receipt object
- `receiptHash`: canonical hash of the receipt object
- `rawProofURI`: storage URI for the raw provider proof
- `rawProofHash`: canonical hash of the raw provider proof
- `userStatus`: currently `PROOF_CAPTURED`
- `userMessage`: seller-facing explanation to submit proof next

### `tyrpay_submit_proof`

Builds a `ProofBundle` from one or more receipts, uploads it, and submits the
resulting proof bundle hash on-chain.

Returns:

- `txHash`: transaction hash for `submitProofBundle`
- `taskId`: task identifier for the submitted proof bundle
- `proofBundleHash`: submitted proof bundle hash
- `proofBundleURI`: storage URI for the submitted proof bundle
- `userStatus`: currently `AWAITING_VERIFICATION`
- `userMessage`: seller-facing explanation that payout now depends on verification

### `tyrpay_check_settlement`

Reads task settlement status from the contract.

Seller-facing statuses currently exposed:

- `READY_TO_ACCEPT`
- `WAITING_FOR_BUYER_FUNDING`
- `READY_TO_EXECUTE`
- `AWAITING_VERIFICATION`
- `PAID`
- `NOT_PAID_REFUNDED`

Returns:

- `taskId`: queried task identifier
- `status`: current on-chain task status
- `settled`: whether the task reached `SETTLED`
- `refunded`: whether the task reached `REFUNDED`
- `proofSubmittedAt`: proof submission timestamp if present
- `proofBundleHash`: submitted proof bundle hash if present
- `proofBundleURI`: submitted proof bundle URI if present
- `settledAt`: settlement timestamp if present
- `refundedAt`: refund timestamp if present
- `reportHash`: verifier report hash if present
- `userStatus`: simplified seller-facing payout status
- `userMessage`: short explanation of the current stage

## Notes For Agent Authors

- `taskNonce` for `tyrpay_execute_task` comes from the on-chain task record.
- `declaredModel` must be included in `commitment.allowedModels`.
- `request.host`, `request.path`, and `request.method` must match the commitment
  target exactly.
- All tool inputs are validated at runtime before any SDK or on-chain calls.

## Related Packages

- `@tyrpay/seller-sdk`: proof generation, bundle assembly, and on-chain seller flow
- `@tyrpay/agent-kit`: prebuilt Claude/OpenAI wrappers if you do not want to map
  the tool shape yourself

## Further Reading

- [Seller Proof Generation Guide](../../docs/seller/seller-proof-generation-guide.md)
