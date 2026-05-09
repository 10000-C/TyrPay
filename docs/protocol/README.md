# TyrPay Protocol Specs

This directory defines the minimal Phase 1 protocol surface for TyrPay.
It is normative for contracts, SDKs, verifier services, storage adapters, zkTLS
adapters, fixtures, and E2E tests.

## Scope

Phase 1 proves that a Seller Agent called a committed model or API, produced a
verifiable proof bundle, and satisfied the minimum usage requirement before
Buyer funds are released.

The protocol does not prove subjective output quality, model reasoning
correctness, or business outcome quality. Phase 1 settlement is intentionally
binary: release all funds to Seller or refund all funds to Buyer.

## Documents

| Document | Purpose |
|---|---|
| [state-machine.md](./state-machine.md) | Defines the canonical task lifecycle and valid transitions. |
| [boundary-cases.md](./boundary-cases.md) | Derives failure, replay, timeout, and invalid transition cases from the state machine. |
| [protocol-objects.md](./protocol-objects.md) | Defines the shared protocol objects that M0 must freeze. |
| [canonicalization-and-hashing.md](./canonicalization-and-hashing.md) | Defines deterministic encoding and hash rules. |
| [storage-adapters.md](./storage-adapters.md) | Defines storage adapter integrity and 0G URI requirements. |
| [signatures-and-replay-protection.md](./signatures-and-replay-protection.md) | Defines EIP-712 report signing and anti-replay bindings. |
| [verification-and-settlement.md](./verification-and-settlement.md) | Defines verifier checks, report semantics, and settlement actions. |
| [fixtures-and-test-vectors.md](./fixtures-and-test-vectors.md) | Defines fixture requirements and cross-module test vectors. |

## Normative Language

The keywords `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, and `MAY` are used as
normative requirements.

## Minimality Rule

Only data that is required by at least two of Contracts, SDK Core, Seller SDK,
Buyer SDK, Verifier, or E2E fixtures belongs in protocol specs.

Implementation-specific details such as PostgreSQL schemas, Fastify routes,
0G SDK call parameters, Reclaim native proof internals, and MCP tool names are
out of scope unless they affect cross-module interoperability.
