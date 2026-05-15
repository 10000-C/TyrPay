**English** | **[中文](./README.md)**

# TyrPay

**Prove fulfillment first, then auto-settle** — A verifiable fulfillment settlement protocol for the Agent-to-Agent economy.

TyrPay locks buyer funds upfront and requires the seller Agent to produce zkTLS cryptographic proof that it actually called the promised model, API, or tool before funds are released. Named after Tyr from Norse mythology — symbolizing rules, fairness, and oaths.

## The Problem

In the Agent economy, service Agents claim to have called certain models, APIs, or tools to complete tasks, but buyers cannot verify whether they actually fulfilled their promises. This creates a "work first or pay first" trust deadlock:

- **Unverifiable service delivery** — Buyers cannot confirm whether the Agent really called the promised high-performance model or substituted a low-cost alternative.
- **Black-box invocations** — AI call requests, responses, and usage lack an auditable evidence chain, making accountability difficult.
- **Cross-entity trust deficit** — Agent-to-Agent collaboration relies on manual trust or centralized platform arbitration, preventing truly trustless transactions.
- **Missing settlement loop** — High-value AI API/model calls have no on-chain settlement mechanism, disconnecting payment from fulfillment.

TyrPay breaks Agent services into three verifiable stages:

1. Buyer publishes a task and locks funds
2. Seller submits an execution commitment (declaring which models, APIs, and usage conditions)
3. Seller executes the task and submits zkTLS proof → auto-release on verification pass, auto-refund on failure or timeout

TyrPay does **not** prove internal model computation correctness or output quality. It proves:

- Whether the Agent called the promised model or API
- Whether the request and response are bound to the current task
- Whether the final delivery comes from the authentic upstream response
- Whether call counts, usage, and budget match commitments

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TyrPay Protocol                          │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌───────────────────────────┐  │
│  │ Buyer    │    │ Seller   │    │ Verifier Service          │  │
│  │ Agent    │    │ Agent    │    │                           │  │
│  │          │    │          │    │  - Verify zkTLS proofs    │  │
│  │ Buyer    │    │ Seller   │    │  - Run 10 check items     │  │
│  │ SDK      │    │ SDK      │    │  - Issue EIP-712 reports  │  │
│  │ Buyer    │    │ Seller   │    │  - Submit on-chain settle │  │
│  │ Skill    │    │ Skill    │    │                           │  │
│  └────┬─────┘    └────┬─────┘    └────────────┬──────────────┘  │
│       │               │                       │                  │
│       ▼               ▼                       ▼                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              TyrPaySettlement (Smart Contract)           │    │
│  │                                                         │    │
│  │  State: INTENT → COMMITMENT → FUNDED → PROOF → SETTLED │    │
│  │  Escrow · State transitions · EIP-712 verify · Release  │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│  ┌──────────────────────────┼──────────────────────────────┐    │
│  │        0G Storage (Evidence Layer)                       │    │
│  │                                                         │    │
│  │  ExecutionCommitment · DeliveryReceipt · ProofBundle     │    │
│  │  VerificationReport — large proofs off-chain, verifiable │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  zkTLS Adapters                          │    │
│  │                                                         │    │
│  │  Reclaim zkFetch  ·  0G TeeTLS  ·  Mock (local testing) │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

Core layers:

| Layer | Component | Responsibility |
|-------|-----------|---------------|
| On-chain Settlement | TyrPaySettlement contract | Escrow funds, record state, execute release or refund |
| Commitment | ExecutionCommitment | Seller declares execution boundaries, preventing post-hoc tampering |
| Proof | zkTLS Adapters | Generate cryptographic proofs for real API/model calls |
| Verification | Verifier Service | Verify proofs against commitments, issue EIP-712 reports |
| Storage | 0G Storage | Persist complete proof objects for traceability and auditability |
| SDK | Buyer SDK / Seller SDK | Programming interfaces for Agent developers |
| Skill | Buyer Skill / Seller Skill | MCP tools for direct Agent tool-calling integration |

## Transaction Flow

```
Buyer Agent              Settlement Contract          Seller Agent             Verifier Service
    │                           │                          │                          │
    │── createTask() ──────────▶│                          │                          │
    │   (fund conditions)       │  INTENT_CREATED          │                          │
    │                           │                          │                          │
    │                           │◀── submitCommitment() ───│                          │
    │                           │   COMMITMENT_SUBMITTED   │                          │
    │                           │                          │                          │
    │── fundTask() ────────────▶│                          │                          │
    │   (ERC20 escrow)          │  FUNDED                  │                          │
    │                           │                          │                          │
    │                           │                          │── zkTLS provenFetch() ──▶│
    │                           │                          │   (call model via zkTLS)  │
    │                           │                          │                          │
    │                           │◀── submitProof() ────────│                          │
    │                           │   PROOF_SUBMITTED        │                          │
    │                           │                          │                          │
    │                           │◀────────────────────── settle() ──────────────────│
    │                           │   SETTLED / REFUNDED     │   (report + EIP-712 sig)  │
    │                           │                          │                          │
```

Timeout refund paths:
- **Proof submission timeout** — After `deadline + gracePeriod`, buyer can call `refundAfterProofSubmissionDeadline()`
- **Verification timeout** — After `proofSubmittedAt + verificationTimeout`, buyer can call `refundAfterVerificationTimeout()`

## Feature Modules

### Smart Contracts

- **TyrPaySettlement** — Core settlement contract with full task state machine, EIP-712 signature verification, replay protection, and timeout refunds
- **VerifierRegistry** — Authorized verifier management; contract Owner can add/remove verifier addresses

### SDKs

| Package | Description |
|---------|-------------|
| `@tyrpay/sdk-core` | Core type definitions, canonical JSON hashing, EIP-712 helpers, protocol constants |
| `@tyrpay/buyer-sdk` | Buyer Agent SDK: create tasks, validate commitments, lock funds, query status, refund |
| `@tyrpay/seller-sdk` | Seller Agent SDK: submit commitments, zkTLS execution, assemble proofs, submit on-chain |

### Skills (MCP Tools)

| Package | Tool | Description |
|---------|------|-------------|
| `@tyrpay/buyer-skill` | `tyrpay_post_task` | Create task, wait for commitment, validate and fund |
| | `tyrpay_fund_task` | Lock funds |
| | `tyrpay_check_task` | Query task status |
| | `tyrpay_refund_task` | Timeout refund |
| | `tyrpay_list_tasks` | Batch query |
| `@tyrpay/seller-skill` | `tyrpay_discover_model_endpoint` | Discover 0G TeeTLS model endpoints |
| | `tyrpay_accept_task` | Submit execution commitment |
| | `tyrpay_execute_task` | Execute zkTLS-verified API calls |
| | `tyrpay_submit_proof` | Assemble and submit proof |
| | `tyrpay_check_settlement` | Query settlement status |

### Verifier Service

Centralized verification service that performs 10 checks on submitted proofs:

| Check | Description |
|-------|-------------|
| `commitmentHashMatched` | Stored commitment hash matches on-chain |
| `proofBundleHashMatched` | Stored proof bundle hash matches on-chain |
| `zkTlsProofValid` | Every raw zkTLS proof verifies successfully |
| `endpointMatched` | Call endpoint matches commitment target |
| `taskContextMatched` | Proof context bound to current task |
| `callIndicesUnique` | callIndex unique within bundle |
| `proofNotConsumed` | Proof not previously consumed (replay protection) |
| `withinTaskWindow` | Call occurred within task validity window |
| `modelMatched` | Called model is in allowed list |
| `usageSatisfied` | Cumulative usage meets minimum requirement |

All pass → RELEASE (funds to seller); any fail → REFUND (funds to buyer).

### Adapters

**zkTLS Adapters** — Unified interface for different zkTLS providers:

| Adapter | Use Case |
|---------|----------|
| `ReclaimZkTlsAdapter` | Production, integrates Reclaim zkFetch |
| `ZeroGTeeTlsAdapter` | Production, integrates 0G Compute TeeTLS |
| `MockZkTlsAdapter` | Local testing, simulates various verification scenarios |

**Storage Adapters** — Pluggable storage backends:

| Adapter | Use Case |
|---------|----------|
| `ZeroGStorageAdapter` | Production, 0G decentralized storage |
| `LocalStorageAdapter` | Local development, file system storage |
| `MemoryStorageAdapter` | Unit testing, in-memory storage |

## Project Structure

```
tyrpay/
├── apps/
│   └── verifier-service/        # Verification service (HTTP API)
├── packages/
│   ├── sdk-core/                # Core types and utilities
│   ├── buyer-sdk/               # Buyer Agent SDK
│   ├── seller-sdk/              # Seller Agent SDK
│   ├── buyer-skill/             # Buyer MCP toolset
│   ├── seller-skill/            # Seller MCP toolset
│   ├── contracts/               # Solidity smart contracts
│   ├── storage-adapter/         # Storage adapters
│   └── zktls-adapter/           # zkTLS adapters
├── test/
│   └── e2e/                     # End-to-end integration tests
├── docs/
│   ├── product doc.md           # Product documentation
│   └── protocol/                # Protocol specification
└── examples/
    └── 0g-teetls-lab/           # 0G TeeTLS example
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 10.0.0
- Git

### Install

```bash
git clone <repo-url> && cd TyrPay
pnpm install
pnpm build
```

### Deploy Contracts

```bash
# Local Hardhat network (development)
pnpm contracts:node          # Start local node
pnpm contracts:deploy:local  # Deploy contracts

# Testnet
# Configure ZERO_G_EVM_RPC and DEPLOYER_PRIVATE_KEY in .env
pnpm contracts:deploy:testnet
```

After deployment, contract addresses are written to `packages/contracts/deployments/addresses.<chainId>.json`.

#### 0G Galileo Testnet Deployed Contracts (Chain ID: 16602)

| Contract | Address |
|----------|---------|
| TyrPaySettlement | `0xa6488EEcD8f13564297dD76E04B550A7580d4C78` |
| VerifierRegistry | `0x0584f117c0703A00Ac8ca9965c825F8a51Cbb619` |

### Deploy Verifier Service

#### 1. Configure Environment Variables

Copy `.env.example` to `.env` and fill in actual values:

```bash
cp .env.example .env
```

```env
# Required — Blockchain & Storage
ZERO_G_EVM_RPC=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai

# Required — Contract address (from deployment output)
SETTLEMENT_CONTRACT=0xYourSettlementContractAddress

# Required — Verifier private key (address must be registered in VerifierRegistry)
VERIFIER_PRIVATE_KEY=0xYourVerifierPrivateKey

# Optional
VERIFIER_PORT=3000
CHAIN_ID=16602
```

#### 2. Register Verifier

Call `VerifierRegistry.addVerifier(verifierAddress)` using the contract Owner to whitelist the verifier wallet address.

#### 3. Start Service

```bash
# Development mode (hot reload)
pnpm --filter @tyrpay/verifier-service dev

# Production mode
pnpm --filter @tyrpay/verifier-service start
```

The service exposes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/verify` | POST | Verify task and settle |

Verify request example:

```bash
curl -X POST http://127.0.0.1:3000/verify \
  -H "Content-Type: application/json" \
  -d '{"taskId":"0x...","settle":true,"waitForSettlement":true}'
```

The response contains the complete `VerificationReport`, individual check results, and settlement transaction info.

#### 4. Production Deployment Notes

- **Proof Consumption Registry**: Defaults to `InMemoryProofConsumptionRegistry` (in-process, lost on restart). For production, replace with a persistent implementation (e.g., `PrismaProofConsumptionRegistry` backed by PostgreSQL).
- **Private key security**: Inject `VERIFIER_PRIVATE_KEY` via environment variables or a key management service — never commit to code or version control.
- **Reverse proxy**: Deploy Nginx or similar in front of the Verifier Service for TLS termination and rate limiting.

### Run Tests

```bash
# Unit tests
pnpm test

# Contract tests
pnpm contracts:test

# E2E tests (requires local node running)
pnpm contracts:node
pnpm test:e2e
```

## Target Users

- **Buyer Agents** — Purchase research, audits, data analysis, trading signals, and pay only for verified fulfillment
- **Seller Agents** — Boost credibility with proofs, accumulate proof-based reputation
- **Agent Marketplaces** — Rank, filter, and price agents based on real fulfillment records

## 0G Integration

TyrPay integrates 0G Storage as the evidence availability layer, storing `ExecutionCommitment`, `DeliveryReceipt`, `ProofBundle`, `VerificationReport`, and other key proof objects. On-chain only stores hashes and URIs, achieving:

- Large proof data stays off-chain, reducing settlement costs
- Proof materials are persistently stored, independently verifiable, and auditable at any time
- Complete verifiable evidence chain: commitment → execution → verification → settlement

## License

MIT License
