# Storage Adapters

This document defines cross-module storage adapter requirements for Phase 1.
It is normative for SDKs, verifier services, storage adapters, and E2E tests.

## Adapter Contract

Storage adapters MUST expose the shared `StorageAdapter` contract:

```text
putObject(value, options) -> { uri, hash }
getObject(pointerOrUri, options) -> value
```

`hash` MUST be the FulfillPay canonical object hash defined in
[canonicalization-and-hashing.md](./canonicalization-and-hashing.md). Storage
provider identifiers MUST NOT replace the FulfillPay object hash.

Storage adapters MUST:

| Requirement | Rule |
|---|---|
| Canonical payload | Store the canonical JSON payload produced by SDK Core. |
| Hash integrity | Recompute the FulfillPay object hash after download before returning an object. |
| URI persistence | Return a URI that contains enough provider metadata to retrieve the object later. |
| Error boundary | Normalize missing objects to `StorageNotFoundError` and hash mismatches to `StorageIntegrityError`. |

## 0G Storage URI

0G Storage uses a provider `rootHash` for retrieval. FulfillPay still uses its
own canonical object hash for protocol integrity and chain commitments.

The Phase 1 URI format is:

```text
0g://storage/<namespace>/<fulfillpayObjectHash>.json?root=<zeroGRootHash>&tx=<optionalUploadTxHash>
```

Rules:

| Field | Requirement |
|---|---|
| `namespace` | MUST follow storage adapter namespace rules. |
| `fulfillpayObjectHash` | MUST be the canonical FulfillPay object hash. |
| `root` | MUST be the 0G Storage root hash returned by the official SDK upload. |
| `tx` | MAY contain the 0G upload transaction hash for diagnostics and indexing. |

Verifier and SDK code MUST verify storage objects against the FulfillPay hash.
They MUST NOT verify fulfillment against the 0G root hash alone.

## 0G SDK Integration

The `@fulfillpay/storage-adapter` package uses the official
`@0glabs/0g-ts-sdk` package for the SDK-backed 0G transport. The official SDK
flow is:

1. Build an `Indexer` from the 0G Storage indexer RPC URL.
2. Upload canonical JSON as `MemData` through `indexer.upload(...)`.
3. Persist the returned `rootHash` in the FulfillPay storage URI.
4. Download by `rootHash` through `indexer.download(...)`.
5. Recompute the FulfillPay canonical object hash before returning data.

Official references:

| Reference | URL |
|---|---|
| 0G Storage SDK docs | https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk |
| 0G Testnet docs | https://docs.0g.ai/developer-hub/testnet/testnet-overview |
| 0G TS SDK package | https://www.npmjs.com/package/@0glabs/0g-ts-sdk |

## Configuration

Applications SHOULD construct storage adapters at the composition boundary and
inject them into Buyer SDK, Seller SDK, and Verifier. Protocol modules MUST NOT
construct storage adapters internally.

Example:

```ts
import { Indexer } from "@0glabs/0g-ts-sdk";
import { ZeroGStorageAdapter, createZeroGStorageTransport } from "@fulfillpay/storage-adapter";
import { JsonRpcProvider, Wallet } from "ethers";

const provider = new JsonRpcProvider(process.env.ZERO_G_EVM_RPC);
const signer = new Wallet(process.env.ZERO_G_STORAGE_PRIVATE_KEY!, provider);

export const storage = new ZeroGStorageAdapter({
  transport: createZeroGStorageTransport({
    indexer: new Indexer(process.env.ZERO_G_INDEXER_RPC!),
    evmRpc: process.env.ZERO_G_EVM_RPC!,
    signer,
    withProof: true
  })
});
```

Local and memory adapters remain valid for tests and local E2E runs. Switching
between `LocalStorageAdapter`, `MemoryStorageAdapter`, and `ZeroGStorageAdapter`
SHOULD be a configuration decision.
