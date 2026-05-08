# M8 Reclaim zkFetch Adapter

## Goal

Implement `ReclaimZkTlsAdapter` as a drop-in `ZkTlsAdapter` for Seller SDK. The adapter must keep FulfillPay protocol objects stable and expose Reclaim proofs through the same `DeliveryReceipt` and raw proof flow used by the mock adapter.

## Interface

Seller SDK passes provider-specific Reclaim options through `providerOptions`.

```ts
interface ProvenFetchInput {
  commitment: ExecutionCommitment;
  callIndex: number;
  request: ZkTlsRequestEvidence;
  declaredModel: string;
  taskNonce: Bytes32;
  providerOptions?: Record<string, unknown>;
}
```

The Reclaim adapter consumes:

```ts
interface ReclaimProvenFetchInput {
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: Bytes32;
  request: ZkTlsRequestEvidence;
  declaredModel: string;
  privateOptions?: ReclaimPrivateOptions;
  retries?: number;
  retryIntervalMs?: number;
  useTee?: boolean;
  extractionProfile?: ReclaimExtractionProfile;
}
```

## Raw Proof Envelope

Reclaim native proof is wrapped in a FulfillPay envelope:

```ts
interface ReclaimRawProof {
  proofSchemaVersion: "fulfillpay.reclaim-zktls-proof.v1";
  provider: "reclaim";
  providerProofId: string;
  proofContext: ProviderProofContext;
  request: ZkTlsRequestEvidence;
  response: ZkTlsResponseEvidence;
  observedAt: UnixMillis;
  extracted: ExtractedReceiptFields;
  reclaimProof: unknown;
  metadata: {
    url: string;
    useTee: boolean;
    retries: number;
    retryIntervalMs: number;
  };
  proofHash: Bytes32;
}
```

This keeps verifier input stable even if Reclaim changes native proof shape.

## Flow

1. Seller SDK builds `taskContext` and `callIntentHash`.
2. Seller SDK forwards `providerOptions` into `ReclaimZkTlsAdapter.provenFetch`.
3. Adapter maps `request` to Reclaim `publicOptions`.
4. Adapter maps `privateOptions`, `retries`, `retryIntervalMs`, and `useTee` to `zkFetch`.
5. Adapter extracts OpenAI-compatible `model` and `usage.total_tokens`.
6. Adapter stores Reclaim native proof inside `ReclaimRawProof`.
7. Adapter normalizes the envelope into a standard `DeliveryReceipt`.

## Verification

`ReclaimZkTlsAdapter` implements both:

- `ZkTlsAdapter`
- verifier-compatible `verifyRawProof` and `extractReceiptEvidence`

Verifier can continue using existing checks:

- `zkTlsProofValid`
- `endpointMatched`
- `taskContextMatched`
- `modelMatched`
- `usageSatisfied`

## Runtime Dependency

The adapter loads Reclaim SDKs dynamically:

- `@reclaimprotocol/zk-fetch`
- `@reclaimprotocol/js-sdk`

This keeps the package compilable even when Reclaim dependencies are not installed. Production deployments must install those packages and provide `appId` and `appSecret`, or inject a custom `clientFactory` and `verifyProof`.

## Current Limits

1. Only OpenAI-compatible response extraction is supported.
2. `model` and `usage.total_tokens` must remain recoverable after redaction.
3. Proof binding is proof-level context binding, not request-level nonce injection.
4. Reclaim native proof field assumptions should be validated against the installed SDK version before production use.
