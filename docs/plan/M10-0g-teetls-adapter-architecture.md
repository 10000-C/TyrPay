# M10 0G TeeTLS Adapter Architecture

## Goal

Implement `ZeroGTeeTlsAdapter` as a drop-in `ZkTlsAdapter` for Seller SDK. The adapter uses 0G Compute's TeeTLS-style inference flow as a proof source while keeping TyrPay protocol objects stable:

- Seller SDK still calls `provenFetch`.
- Verifier still calls `verifyRawProof` and `extractReceiptEvidence`.
- Settlement still consumes TyrPay `VerificationReport`, not a 0G-native proof.

M10 is a provider adapter, not a replacement for `CentralizedVerifier`.

## Official 0G Compute Surface

The current 0G Compute TypeScript SDK flow exposes:

```ts
const broker = await createZGComputeNetworkBroker(wallet);

const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
const headers = await broker.inference.getRequestHeaders(providerAddress, content);

const response = await fetch(`${endpoint}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...headers
  },
  body: JSON.stringify({
    model,
    messages
  })
});

const isValid = await broker.inference.processResponse(providerAddress, chatId, content);
```

Observed from the local `examples/0g-teetls-lab` experiment:

- `endpoint` is available from `getServiceMetadata`.
- `model` is available from `getServiceMetadata`.
- `usage` is not returned by 0G SDK metadata; it must be extracted from the OpenAI-compatible response body.
- `getRequestHeaders` requires 0G inference ledger and provider sub-account funding.
- `processResponse` returns a verification result (`boolean | null`) and requires a `chatId`; it does not expose a stable first-class `TeeTLSProof` object.

## Interface

Seller SDK keeps the existing provider-agnostic input:

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

The 0G adapter consumes the fields below after Seller SDK adds `taskContext` and `callIntentHash`:

```ts
interface ZeroGTeeTlsProvenFetchInput {
  taskContext: TaskContext;
  callIndex: number;
  callIntentHash: Bytes32;
  request: ZkTlsRequestEvidence;
  declaredModel: string;

  providerAddress: Address;
  queryContent?: string;
  requestPath?: string; // default: /chat/completions
  responseExtractionProfile?: ZeroGResponseExtractionProfile;
}

interface ZeroGTeeTlsAdapterConfig {
  signer: Wallet | JsonRpcSigner;
  providerAddress?: Address;
  defaultRequestPath?: string;
  brokerFactory?: ZeroGComputeBrokerFactory;
  fetchImpl?: typeof fetch;
}
```

`providerOptions` MUST be the only place where caller-specific 0G options enter the adapter. Buyer SDK, Contracts, and Verifier MUST NOT need to understand these options.

## Raw Proof Envelope

Because the current SDK does not expose a stable `TeeTLSProof` type, TyrPay wraps the 0G invocation into its own raw proof envelope:

```ts
interface ZeroGTeeTlsRawProof {
  proofSchemaVersion: "TyrPay.0g-teetls-proof.v1";
  provider: "0g-teetls";
  providerProofId: string;
  proofContext: ProviderProofContext;

  request: ZkTlsRequestEvidence;
  response: ZkTlsResponseEvidence;
  observedAt: UnixMillis;
  extracted: ExtractedReceiptFields;

  zeroG: {
    providerAddress: Address;
    endpoint: string;
    modelFromMetadata: string;
    requestHeaderKeys: string[];
    chatId?: string;
    processResponseResult: boolean | null;
    teeSignerAddress?: Address;
    signerAcknowledged?: boolean;
  };

  metadata: {
    sdkPackage: "@0gfoundation/0g-compute-ts-sdk";
    requestPath: string;
    usageSource: "response.body.usage" | "response.body.x_groq.usage" | "custom";
    contentSource: "choices[0].message.content" | "choices[0].delta.content" | "custom";
  };

  proofHash: Bytes32;
}
```

`providerProofId` SHOULD be derived from the strongest available 0G response identifier:

1. `chatId`, preferably from `ZG-Res-Key`.
2. OpenAI-compatible `response.body.id`.
3. A deterministic hash of `{ providerAddress, endpoint, model, responseHash, observedAt }` when no chat id is available.

## Field Mapping

| TyrPay field | 0G source | Required | Notes |
|---|---|---:|---|
| `request.host/path/method/body` | Seller SDK request + resolved 0G endpoint | Yes | Path defaults to `/chat/completions`; adapter records final endpoint in raw proof. |
| `response.body` | OpenAI-compatible provider response | Yes | Stored in raw proof so verifier can recompute `responseHash`. |
| `extracted.model` | `getServiceMetadata().model`, cross-checked with `response.body.model` when present | Yes | Metadata model is authoritative for request; response model mismatch should fail verification if present and different. |
| `extracted.usage.totalTokens` | `response.body.usage.total_tokens` or equivalent profile path | Yes | M10 MUST fail receipt normalization if usage cannot be extracted. |
| `observedAt` | local adapter clock after response is received | Yes | 0G SDK does not expose a standard response timestamp in the high-level flow. |
| `providerProofId` | `chatId` / response id / deterministic fallback hash | Yes | Used by proof consumption registry. |
| `processResponseResult` | `broker.inference.processResponse(providerAddress, chatId, content)` | Yes for live TeeTLS verification | If `chatId` is unavailable, `verifyRawProof` MUST return false for production mode. |

## Flow

1. Seller SDK builds `taskContext` and `callIntentHash`.
2. Seller SDK forwards `providerOptions` into `ZeroGTeeTlsAdapter.provenFetch`.
3. Adapter resolves `{ endpoint, model }` via `getServiceMetadata(providerAddress)`.
4. Adapter obtains billing headers via `getRequestHeaders(providerAddress, queryContent)`.
5. Adapter sends an OpenAI-compatible request to the resolved endpoint.
6. Adapter extracts `chatId`, content, model, and usage from the response.
7. Adapter calls `processResponse(providerAddress, chatId, content)` and records the result.
8. Adapter wraps request, response, extracted fields, 0G metadata, and process result into `ZeroGTeeTlsRawProof`.
9. Seller SDK stores the raw proof and asks the adapter to normalize it into `DeliveryReceipt`.
10. Verifier reloads the raw proof, verifies the envelope, verifies the 0G response result, and applies existing TyrPay checks.

## Verification Rules

`verifyRawProof` MUST return true only when:

1. `proofHash` matches the canonical raw proof payload.
2. `provider === "0g-teetls"` and schema version is supported.
3. `processResponseResult === true`.
4. `requestHash` and `responseHash` can be recomputed from the stored request and response.
5. `extracted.model` is non-empty and matches the metadata model, and if `response.body.model` exists it must match as well.
6. `extracted.usage.totalTokens` is present and non-negative.
7. `proofContext` is present and well formed.

`normalizeReceipt` MUST reject raw proofs that fail `verifyRawProof`. This keeps `DeliveryReceipt` semantics aligned with Mock and Reclaim adapters.

Verifier can continue using existing checks:

- `zkTlsProofValid`
- `endpointMatched`
- `taskContextMatched`
- `modelMatched`
- `usageSatisfied`
- `proofNotConsumed`

## Security Boundary

M10 remains proof-level binding.

0G `processResponse` verifies the response through 0G Compute's TEE-backed flow, but the current high-level SDK does not expose a standard proof object that embeds TyrPay `taskContext`. Therefore:

- TyrPay task binding lives in the raw proof envelope and receipt.
- 0G verifies provider response validity.
- TyrPay Verifier still decides fulfillment and signs the final `VerificationReport`.

M10 MUST NOT claim request-level nonce injection unless a future 0G API exposes a way to bind `callIntentHash` or `taskNonce` inside the signed TeeTLS proof material.

## Runtime Preconditions

A live 0G TeeTLS call requires:

- a wallet on the selected 0G network;
- an inference ledger account;
- provider signer acknowledgement where required;
- a funded provider inference sub-account;
- a provider whose OpenAI-compatible response includes recoverable model and usage fields.

If these preconditions are missing, the adapter should surface a typed provider-unavailable error instead of fabricating a receipt.

## Current Limits

1. Non-streaming OpenAI-compatible responses only.
2. `usage.total_tokens` must be recoverable from the final response body.
3. `processResponse` currently yields a boolean/null result, not a durable native proof object.
4. `chatId` must be available for production verification.
5. 0G ledger and provider sub-account setup is an operational prerequisite, not a TyrPay protocol object.
6. Final settlement trust still rests on TyrPay Verifier's EIP-712 report signature.
