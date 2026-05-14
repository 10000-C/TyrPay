# Seller Proof Generation Guide

## Goal

This guide explains what the seller side must pass into `SellerAgent`, and how to generate:

- `rawProof`
- `DeliveryReceipt`
- `ProofBundle`

The seller does not construct these protocol objects manually. The SDK generates them.

## What the Seller Must Prepare

Before calling the SDK, the seller must already have:

- a funded task on-chain
- the buyer-approved `ExecutionCommitment`
- the on-chain `taskNonce`
- a wallet signer for seller transactions
- a storage adapter
- a zkTLS adapter

## Objects the Seller Passes Into the SDK

### 1. `SellerAgent` config

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
    appSecret: process.env.RECLAIM_APP_SECRET,
    enableLogs: true
  })
});
```

Required fields:

- `signer`: seller wallet signer
- `settlementContract`: TyrPay settlement contract address
- `chainId`: target chain id
- `storageAdapter`: where raw proofs, receipts, and bundles are stored
- `zkTlsAdapter`: proof provider implementation, for example `ReclaimZkTlsAdapter`

For live buyer/verifier flows, do not use `MemoryStorageAdapter`. It writes
objects into process memory and returns `memory://` URIs that another process
cannot fetch. Use a persistent shared adapter such as `ZeroGStorageAdapter`, or
another adapter that returns retrievable `0g://`, `ipfs://`, or `https://` URIs.

### 2. `provenFetch` input

For each model call the seller wants to prove, pass:

```ts
const result = await agent.provenFetch({
  commitment,
  callIndex: 0,
  taskNonce,
  declaredModel: "gpt-4o-mini",
  request: {
    host: "api.openai.com",
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "ping"
        }
      ]
    }
  },
  providerOptions: {
    privateOptions: {
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    },
    retries: 2,
    retryIntervalMs: 500
  }
});
```

Required fields:

- `commitment`: buyer-approved execution commitment
- `callIndex`: zero-based index of this call inside the task
- `taskNonce`: the nonce stored on-chain for this task
- `declaredModel`: must be included in `commitment.allowedModels`
- `request`: the exact API request being proven

Optional field:

- `providerOptions`: provider-specific zkTLS options passed through to the adapter

## What `provenFetch` Returns

`agent.provenFetch()` returns:

- `rawProof`: provider-native proof wrapped in TyrPay envelope
- `rawProofPointer`: storage pointer for the raw proof
- `receipt`: normalized `DeliveryReceipt`
- `receiptPointer`: storage pointer for the receipt

The seller should keep the returned `receipt` objects and use them to build the final proof bundle.

## Reclaim `providerOptions`

When using `ReclaimZkTlsAdapter`, pass Reclaim-specific fields under `providerOptions`.

Supported fields today:

- `privateOptions.headers`: private request headers, usually `authorization`
- `privateOptions.cookieStr`: private cookies if required by the upstream API
- `privateOptions.paramValues`: private template parameters if Reclaim proof config needs them
- `privateOptions.responseMatches`: response matching rules
- `privateOptions.responseRedactions`: response redaction rules
- `retries`: retry count for `zkFetch`
- `retryIntervalMs`: retry interval in milliseconds
- `useTee`: whether to enable TEE mode for this specific `zkFetch` call
- `extractionProfile`: extraction mode, currently only `openai-compatible`

Example:

```ts
providerOptions: {
  privateOptions: {
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    }
  },
  retries: 2,
  retryIntervalMs: 500,
  extractionProfile: {
    mode: "openai-compatible"
  }
}
```

Adapter config fields:

- `appId`: Reclaim application id
- `appSecret`: Reclaim application secret
- `enableLogs`: whether to pass `logs=true` into `ReclaimClient`
- `defaultUseTee`: optional adapter config for TEE mode; if a call does not pass `providerOptions.useTee`, the effective default is `false`
- `defaultRetries`: default retry count if a call does not pass `providerOptions.retries`
- `defaultRetryIntervalMs`: default retry interval if a call does not pass `providerOptions.retryIntervalMs`

TEE note:

- `useTee` is a per-request `zkFetch` option. It is not a constructor argument.
- `@reclaimprotocol/zk-fetch` TEE mode is not supported on Windows. On Windows hosts, keep `useTee` unset or `false`.

Runtime requirements:

- Install the optional Reclaim peer dependencies in the runtime that constructs
  `ReclaimZkTlsAdapter`:

```bash
pnpm add @reclaimprotocol/zk-fetch @reclaimprotocol/js-sdk
```

- Download the Reclaim zk resources before production use:

```bash
node node_modules/@reclaimprotocol/zk-fetch/scripts/download-files.js
```

If `@reclaimprotocol/zk-fetch` cannot be installed or initialized in the runtime,
`ReclaimZkTlsAdapter` cannot generate a real zkTLS proof. `MockZkTlsAdapter` is
only a local testing substitute; it should not be used for payable tasks that a
buyer or verifier expects to validate independently.

## Build the Final Proof Bundle

After all proven calls are complete, aggregate the returned receipts:

```ts
const bundle = agent.buildProofBundle({
  commitment,
  receipts: [result0.receipt, result1.receipt]
});

const uploadResult = await agent.uploadProofBundle(bundle);
```

`bundle` is the seller-side proof report submitted for settlement. It includes:

- all `DeliveryReceipt` entries
- aggregate token usage
- commitment binding

## Submit the Bundle On-Chain

After the bundle is uploaded, submit its hash and URI:

```ts
await agent.submitProofBundleHash(
  settlementContractInstance,
  bundle.taskId,
  uploadResult.pointer.hash,
  uploadResult.pointer.uri
);
```

This is the final seller-side proof submission step.

## Full Flow

```ts
const result0 = await agent.provenFetch({
  commitment,
  callIndex: 0,
  taskNonce,
  declaredModel: "gpt-4o-mini",
  request: {
    host: commitment.target.host,
    path: commitment.target.path,
    method: commitment.target.method,
    headers: {
      "content-type": "application/json"
    },
    body: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }]
    }
  },
  providerOptions: {
    privateOptions: {
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    },
    retries: 2,
    retryIntervalMs: 500
  }
});

const bundle = agent.buildProofBundle({
  commitment,
  receipts: [result0.receipt]
});

const uploadResult = await agent.uploadProofBundle(bundle);

await agent.submitProofBundleHash(
  settlementContractInstance,
  bundle.taskId,
  uploadResult.pointer.hash,
  uploadResult.pointer.uri
);
```

## Rules the Seller Must Not Break

- `request.host`, `request.path`, and `request.method` must match `commitment.target`
- `declaredModel` must be in `commitment.allowedModels`
- `callIndex` must match the actual position of the call in the task
- `taskNonce` must be the on-chain nonce for the funded task
- the request body being proven must be the real upstream request body

If these constraints are violated, `SellerAgent.provenFetch()` should reject before proof generation.

## Recommended Seller Workflow

1. Read funded task state and get `taskNonce`
2. Load the finalized `ExecutionCommitment`
3. Create one `SellerAgent`
4. Call `provenFetch()` for each upstream model call
5. Collect all returned `receipt` objects
6. Build and upload one `ProofBundle`
7. Submit the bundle hash and URI on-chain

## Debugging Common Integration Failures

### `getTask()` fields look shifted

The contract ABI used by the seller runtime must match the deployed
`TyrPaySettlement` struct exactly:

```text
taskId, taskNonce, buyer, seller, token, amount, deadlineMs,
commitmentHash, commitmentURI, fundedAtMs,
proofBundleHash, proofBundleURI, proofSubmittedAtMs,
reportHash, settledAtMs, refundedAtMs, status
```

If an older ABI omits `taskNonce`, uses `deadline` instead of `deadlineMs`, or
maps the ethers result by numeric indexes incorrectly, the seller skill can read
the wrong `seller`, `commitmentHash`, or `status`. Compare the raw `getTask()`
return value against this order before debugging the zkTLS layer.

### Commitment hash mismatch

`commitmentHash` is computed from the complete canonical `ExecutionCommitment`.
It is not derivable from the on-chain task record by itself. To verify or resume
a seller flow, fetch the object from `commitmentURI` and recompute
`hashExecutionCommitment(commitment)`. If the commitment was originally stored
with `memory://` in another process, the original object is unavailable unless
that process exported it.

## Current Limits

- `ReclaimZkTlsAdapter` currently supports only `openai-compatible` extraction
- production Reclaim integration still requires deploy-time installation of Reclaim SDK dependencies
- production Reclaim integration also requires zk resource files downloaded by the official `zk-fetch` downloader
- Windows hosts cannot use Reclaim TEE mode through `@reclaimprotocol/zk-fetch`
- `MemoryStorageAdapter` is for local testing only; production should use persistent storage
