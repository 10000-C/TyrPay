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
- the registry-authorized verifier signer address that should be embedded into commitments

### Contract ABI compatibility

The `contract` passed to `createSellerTools` must use an ABI that matches the
deployed `TyrPaySettlement` contract. In particular, `getTask(bytes32)` must
return the current `Task` struct in this exact order:

```text
taskId, taskNonce, buyer, seller, token, amount, deadlineMs,
commitmentHash, commitmentURI, fundedAtMs,
proofBundleHash, proofBundleURI, proofSubmittedAtMs,
reportHash, settledAtMs, refundedAtMs, status
```

Use this ABI fragment when constructing an ethers contract for seller-skill:

```ts
const TyrPaySettlementAbi = [
  "function submitCommitment(bytes32 taskId,bytes32 commitmentHash,string commitmentURI)",
  "function submitProofBundle(bytes32 taskId,bytes32 proofBundleHash,string proofBundleURI)",
  "function getTask(bytes32 taskId) view returns ((bytes32 taskId, bytes32 taskNonce, address buyer, address seller, address token, uint256 amount, uint256 deadlineMs, bytes32 commitmentHash, string commitmentURI, uint256 fundedAtMs, bytes32 proofBundleHash, string proofBundleURI, uint256 proofSubmittedAtMs, bytes32 reportHash, uint256 settledAtMs, uint256 refundedAtMs, uint8 status))"
];
```

If an older ABI has `deadline` instead of `deadlineMs`, omits `taskNonce`, or
orders `commitmentHash` before `deadlineMs`, ethers can still return a value but
seller-skill will read the wrong field names. Typical symptoms are:

- `tyrpay_check_settlement` reports an impossible status.
- `tyrpay_accept_task` reads the wrong buyer or seller.
- `tyrpay_execute_task` cannot derive the expected task context.
- Receipt `taskContext.commitmentHash` does not match the commitment used later.

Do not rely on positional array indexes from `getTask()` unless you map them to
the field names above before passing the contract into seller-skill.

Minimal `SellerAgent` setup:

```ts
import { SellerAgent } from "@tyrpay/seller-sdk";
import { MemoryStorageAdapter } from "@tyrpay/storage-adapter";
import { ReclaimZkTlsAdapter } from "@tyrpay/zktls-adapter";

const agent = new SellerAgent({
  signer,
  settlementContract,
  chainId,
  storageAdapter: new MemoryStorageAdapter(), // local tests only
  zkTlsAdapter: new ReclaimZkTlsAdapter({
    appId: process.env.RECLAIM_APP_ID,
    appSecret: process.env.RECLAIM_APP_SECRET
  })
});
```

## Environment Variables

`seller-skill` itself does not read environment variables, but constructing the full
seller stack requires the following values. The table groups them by component.

### Settlement chain & wallet

| Variable | Required | Description |
|---|---|---|
| `ZERO_G_EVM_RPC` | yes | EVM RPC endpoint for the settlement chain; also used by the 0G storage adapter |
| `SELLER_PRIVATE_KEY` | yes | Private key of the seller wallet; used to sign on-chain transactions |
| `CHAIN_ID` | yes | Settlement chain ID (must match the RPC endpoint) |
| `SETTLEMENT_CONTRACT` | yes | Address of the deployed TyrPay settlement contract |

### 0G storage adapter (production)

Required if using `ZeroGStorageAdapter`. Omit if using `MemoryStorageAdapter` (testing only).

| Variable | Required | Description |
|---|---|---|
| `ZERO_G_INDEXER_RPC` | yes | 0G indexer endpoint for storage reads |
| `ZERO_G_STORAGE_PRIVATE_KEY` | yes | Private key for uploading proofs and receipts to 0G storage |

`MemoryStorageAdapter` returns `memory://...` URIs. Those URIs are valid only
inside the same JavaScript process that wrote the object. They must not be used
for a task that the buyer, verifier, or another agent process needs to read.
For real settlement flows, use persistent shared storage such as
`ZeroGStorageAdapter` or another adapter that returns retrievable `0g://`,
`ipfs://`, or `https://` URIs.

### Reclaim zkTLS adapter (production)

Required if using `ReclaimZkTlsAdapter`. Omit if using `MockZkTlsAdapter` (testing only).

Install these optional peer dependencies in the runtime that constructs
`ReclaimZkTlsAdapter`:

```bash
pnpm add @reclaimprotocol/zk-fetch @reclaimprotocol/js-sdk
```

| Variable | Required | Description |
|---|---|---|
| `RECLAIM_APP_ID` | yes | Reclaim protocol application ID |
| `RECLAIM_APP_SECRET` | yes | Reclaim protocol application secret |

### Upstream API key (runtime)

Passed at call time through `providerOptions.privateOptions.headers`, not in constructor config.
The key name depends on the upstream service being proven.

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | example | Bearer token for the upstream API (OpenAI shown as an example) |

### Optional

| Variable | Default | Description |
|---|---|---|
| `tyrpay_E2E_TIMING` | unset | Set to `"1"` to enable end-to-end timing logs in `SellerAgent.provenFetch()` |

## Basic Usage

### Raw tool definitions

```ts
import { createSellerTools } from "@tyrpay/seller-skill";

const tools = createSellerTools({
  agent,
  contract,
  verifierSignerAddress
});
```

`verifierSignerAddress` is the address that signs `VerificationReport` objects
and is authorized by `VerifierRegistry`. It is not the settlement contract
address, verifier registry contract address, verifier service URL, or a verifier
service contract address. The legacy config field `verifier` is still accepted
for compatibility, but it has the same signer-address meaning.

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
  verifierSignerAddress
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
  verifierSignerAddress
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
  verifierSignerAddress
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
- The `commitment` passed to `tyrpay_execute_task` and `tyrpay_submit_proof`
  must be the exact object returned by `tyrpay_accept_task` or fetched from
  the submitted `commitmentURI`. It cannot be reconstructed from `getTask()`
  alone.
- `declaredModel` must be included in `commitment.allowedModels`.
- `request.host`, `request.path`, and `request.method` must match the commitment
  target exactly.
- All tool inputs are validated at runtime before any SDK or on-chain calls.

## Troubleshooting Seller Skill Runs

### Seller address matches, buyer funded, task exists, but tool state is wrong

Check the ABI used to construct the readable settlement contract. The current
seller-skill expects named `getTask()` fields matching the contract struct order
listed in [Contract ABI compatibility](#contract-abi-compatibility). A stale ABI
can make `task.seller`, `task.commitmentHash`, `task.status`, or timestamp
fields point at the wrong return slot.

Quick checks:

- Confirm the deployed contract is the current `TyrPaySettlement.sol`.
- Confirm the ABI contains `taskNonce` and uses `deadlineMs`, `fundedAtMs`,
  `proofSubmittedAtMs`, `settledAtMs`, and `refundedAtMs`.
- Log the raw `getTask(taskId)` result and compare both named fields and numeric
  indexes against the expected order.

### `memory://` storage is rejected or cannot be read

`memory://` is not a portable storage URI. It only works when every participant
uses the same in-memory adapter instance in the same process. A buyer SDK,
verifier service, or separate seller agent cannot retrieve it. Use 0G/IPFS/HTTP
storage before writing hashes and URIs that other parties must verify.

### Commitment hash mismatch

`commitmentHash` is the canonical hash of the full `ExecutionCommitment`, not a
hash derived from the on-chain task fields. The full object includes target
host/path/method, allowed models, min usage, verifier, seller, buyer, deadline,
schema version, and task id. Any missing field, case difference, changed model
list order, timestamp change, or different canonical JSON payload changes the
hash.

To recover:

1. Read `commitmentHash` and `commitmentURI` from `getTask(taskId)`.
2. Fetch the full commitment object from `commitmentURI` using the same storage
   adapter family that wrote it.
3. Recompute `hashExecutionCommitment(commitment)`.
4. Continue only if the recomputed hash equals the on-chain `commitmentHash`.

If the original commitment was written to `memory://` by another process, it is
not recoverable from chain data alone. The buyer or seller process that created
the task must provide the original commitment object or submit a new task.

### Reclaim zkTLS dependency or proof generation failure

`ReclaimZkTlsAdapter` dynamically imports `@reclaimprotocol/zk-fetch` at
runtime. Real Reclaim proofs require the package, `@reclaimprotocol/js-sdk`,
valid `RECLAIM_APP_ID` and `RECLAIM_APP_SECRET`, and downloaded zk resources:

```bash
node node_modules/@reclaimprotocol/zk-fetch/scripts/download-files.js
```

On Windows, Reclaim TEE mode is not supported by `@reclaimprotocol/zk-fetch`;
keep `useTee` unset or `false`. If the package cannot be installed in the
current runtime, seller-skill cannot produce a real Reclaim zkTLS proof. Use
`MockZkTlsAdapter` only for local tests, or switch to a runtime where Reclaim
dependencies install and initialize successfully.

## Related Packages

- `@tyrpay/seller-sdk`: proof generation, bundle assembly, and on-chain seller flow
- `@tyrpay/agent-kit`: prebuilt Claude/OpenAI wrappers if you do not want to map
  the tool shape yourself

## Further Reading

- [Seller Proof Generation Guide](../../docs/seller/seller-proof-generation-guide.md)
