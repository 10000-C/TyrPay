# TyrPay

## One-Line Pitch

TyrPay is a verifiable settlement protocol for the Agent Economy: lock payment first, prove that an AI agent actually called the promised model or API with zkTLS, then release funds or refund automatically.

## Project Overview

AI agents are becoming independent economic actors, but one critical layer is still missing: **trustless settlement**.

Today, a buyer cannot reliably verify whether a seller agent truly called the agreed model, API, or execution path. On the other side, a seller who completes the work still depends on trust, manual review, or centralized platforms to get paid. That makes agent-to-agent commerce fragile, opaque, and hard to scale.

TyrPay fixes this.

We break an agent service transaction into three verifiable stages:

1. The buyer posts a task and locks funds on-chain.
2. The seller submits an execution commitment that defines what model, API, and usage conditions will be satisfied.
3. After execution, the seller submits zkTLS-backed proof. If the proof matches the commitment, payment is released automatically. If it fails or times out, the buyer is refunded automatically.

TyrPay is not a protocol that pays for vague outcomes. It is a protocol that pays for **verifiable fulfillment**. It upgrades agent payments from “trust me, I did it” to “prove it, then get paid.”

## What Problem We Solve

- Unverifiable delivery in agent-based services.
- Black-box AI/API execution with weak accountability.
- Trust deadlock between “do the work first” and “pay first”.
- Lack of a full on-chain settlement loop for high-value AI service transactions.

## 0G Integration

TyrPay integrates **0G Storage** as a core infrastructure layer.

We store critical proof objects such as `Execution Commitment`, `Delivery Receipt`, `Proof Bundle`, and `Verification Report` in 0G Storage, while only hashes and URIs are anchored on-chain.

This creates three immediate benefits:

- Large proof payloads stay off-chain, reducing settlement cost.
- Evidence remains persistently available, independently verifiable, and auditable.
- Every transaction gains a complete proof trail across commitment, execution, verification, and settlement.

For TyrPay, 0G Storage is not just a file bucket. It is the **evidence availability layer** of the protocol.

## Core Mechanism

TyrPay’s minimal trust loop is straightforward:

- **On-chain settlement layer**: smart contracts escrow funds, track task state, and execute payout or refund.
- **Commitment layer**: the seller defines execution terms before work starts.
- **Proof layer**: zkTLS proves that the promised API or model call actually happened.
- **Verification layer**: a verifier checks whether the proof satisfies the commitment.
- **Storage layer**: 0G Storage preserves the full proof objects for traceability and auditability.

In one sentence: **the chain secures the money, zkTLS secures the truth, and 0G secures the evidence.**

## Why This Matters

TyrPay is built for the fast-emerging agent-to-agent economy.

In the near future, autonomous agents will purchase data, invoke models, run strategies, produce content, and deliver machine-to-machine services at scale. Without a verifiable settlement layer, those workflows remain demos, closed platforms, or trust-based integrations.

TyrPay provides a missing piece of infrastructure for AI x Web3:

- It makes AI service fulfillment provable.
- It removes the need for centralized payment arbitration.
- It gives 0G-native agent applications a real transaction layer, not just a showcase layer.

## Current Implementation Highlights

- Modular Buyer SDK and Seller SDK for agent-side integration.
- zkTLS-based proof capture and standardized proof bundle construction.
- 0G Storage Adapter for upload, retrieval, and integrity verification of proof objects.
- Verifier service integrated with the on-chain settlement flow.
- Buyer and Seller skills designed for direct agent tool-calling workflows.

## Closing

TyrPay is not another payment interface. It is a **verifiable settlement protocol** for the age of AI agents.

If AI agents are going to work for each other across trust boundaries, they need a way to transact safely, prove fulfillment, and settle automatically.

**Every agent service should come with evidence. Every payment should depend on fulfillment.**
