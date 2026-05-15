# Storage Adapters

This document defines cross-module storage adapter requirements for Phase 1.
It is normative for SDKs, verifier services, storage adapters, and E2E tests.

## Adapter Contract

Storage adapters MUST expose the shared `StorageAdapter` contract:

```text
putObject(value, options) -> { uri, hash }
getObject(pointerOrUri, options) -> value
```

`hash` MUST be the TyrPay canonical object hash defined in
[canonicalization-and-hashing.md](./canonicalization-and-hashing.md). Storage
provider identifiers MUST NOT replace the TyrPay object hash.

Storage adapters MUST:

| Requirement | Rule |
|---|---|
| Canonical payload | Store the canonical JSON payload produced by SDK Core. |
| Hash integrity | Recompute the TyrPay object hash after download before returning an object. |
| URI persistence | Return a URI that contains enough provider metadata to retrieve the object later. |
| Error boundary | Normalize missing objects to `StorageNotFoundError` and hash mismatches to `StorageIntegrityError`. |

## 0G Storage URI

0G Storage uses a provider `rootHash` for retrieval. TyrPay still uses its
own canonical object hash for protocol integrity and chain commitments.

The Phase 1 URI format is:

```text
0g://storage/<namespace>/<TyrPayObjectHash>.json?root=<zeroGRootHash>&tx=<optionalUploadTxHash>
```

Rules:

| Field | Requirement |
|---|---|
| `namespace` | MUST follow storage adapter namespace rules. |
| `TyrPayObjectHash` | MUST be the canonical TyrPay object hash. |
| `root` | MUST be the 0G Storage root hash returned by the official SDK upload. |
| `tx` | MAY contain the 0G upload transaction hash for diagnostics and indexing. |

Verifier and SDK code MUST verify storage objects against the TyrPay hash.
They MUST NOT verify fulfillment against the 0G root hash alone.

## 0G SDK Integration

The `@tyrpay/storage-adapter` package uses the official
`@0gfoundation/0g-storage-ts-sdk` package for the SDK-backed 0G transport. The
official SDK flow is:

1. Build an `Indexer` from the 0G Storage indexer RPC URL.
2. Upload canonical JSON as `MemData` through `indexer.upload(...)`.
3. Persist the returned `rootHash` in the TyrPay storage URI.
4. Download by `rootHash` through `indexer.download(...)`.
5. Recompute the TyrPay canonical object hash before returning data.

Official references:

| Reference | URL |
|---|---|
| 0G Storage SDK docs | https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk |
| 0G Testnet docs | https://docs.0g.ai/developer-hub/testnet/testnet-overview |
| 0G Storage TS SDK package | https://www.npmjs.com/package/@0gfoundation/0g-storage-ts-sdk |

## Configuration

Applications SHOULD construct storage adapters at the composition boundary and
inject them into Buyer SDK, Seller SDK, and Verifier. Protocol modules MUST NOT
construct storage adapters internally.

Example:

```ts
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { ZeroGStorageAdapter, createZeroGStorageTransport } from "@tyrpay/storage-adapter";
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
