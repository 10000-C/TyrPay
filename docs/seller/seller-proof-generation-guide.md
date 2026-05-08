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
import { SellerAgent } from "@fulfillpay/seller-sdk";
import { MemoryStorageAdapter } from "@fulfillpay/storage-adapter";
import { ReclaimZkTlsAdapter } from "@fulfillpay/zktls-adapter";

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

Required fields:

- `signer`: seller wallet signer
- `settlementContract`: FulfillPay settlement contract address
- `chainId`: target chain id
- `storageAdapter`: where raw proofs, receipts, and bundles are stored
- `zkTlsAdapter`: proof provider implementation, for example `ReclaimZkTlsAdapter`

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
    retryIntervalMs: 500,
    useTee: true
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

- `rawProof`: provider-native proof wrapped in FulfillPay envelope
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
- `useTee`: whether to enable TEE mode
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
  useTee: true,
  extractionProfile: {
    mode: "openai-compatible"
  }
}
```

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
    retryIntervalMs: 500,
    useTee: true
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

## Current Limits

- `ReclaimZkTlsAdapter` currently supports only `openai-compatible` extraction
- production Reclaim integration still requires deploy-time installation of Reclaim SDK dependencies
- `MemoryStorageAdapter` is for local testing only; production should use persistent storage
