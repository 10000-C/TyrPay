# @tyrpay/buyer-skill

LLM-callable buyer-side tools for the TyrPay Phase 1 protocol.

This package wraps a configured `BuyerSdk` into structured tool definitions that
an agent can pass directly to Claude-style or OpenAI-style tool calling.

## What This Package Exports

- `createBuyerTools(sdk)`: returns four buyer-side tools
- `BuyerTool`: the shared tool shape used by this package

Tool names:

- `tyrpay_post_task`
- `tyrpay_check_task`
- `tyrpay_refund_task`
- `tyrpay_list_tasks`

## Installation

```bash
pnpm add @tyrpay/buyer-skill @tyrpay/buyer-sdk @tyrpay/storage-adapter
```

`@tyrpay/buyer-skill` does not construct wallets, providers, or storage for you.
You must configure `BuyerSdk` first.

## End-to-End Flow

Typical buyer-side flow:

1. Configure `BuyerSdk` with a signer, settlement contract address, and storage adapter.
2. Call `tyrpay_post_task` to create the task intent.
3. The tool waits for the seller to submit a commitment.
4. The tool validates the submitted commitment against any buyer expectations you passed.
5. The tool funds the task on-chain.
6. Share the returned `taskId` with the seller through your own application or messaging layer.
7. Later, use `tyrpay_check_task` or `tyrpay_list_tasks` to monitor progress with both raw protocol status and buyer-facing status fields.
8. If the seller or verifier misses a protocol deadline, use `tyrpay_refund_task`.

`buyer-skill` does not notify the seller for you. Buyer/seller coordination is
an application responsibility outside this package.

## Prerequisites

Before calling `createBuyerTools`, prepare:

- an EVM signer connected to a provider
- the deployed TyrPay settlement contract address
- a storage adapter that can read commitment objects

Minimal `BuyerSdk` setup:

```ts
import { BuyerSdk } from "@tyrpay/buyer-sdk";
import { MemoryStorageAdapter } from "@tyrpay/storage-adapter";

const sdk = new BuyerSdk({
  signer,
  settlementAddress,
  storage: new MemoryStorageAdapter()
});
```

## Basic Usage

### Raw tool definitions

```ts
import { createBuyerTools } from "@tyrpay/buyer-skill";

const tools = createBuyerTools(sdk);
```

Each returned tool has:

- `name`
- `description`
- `inputSchema`
- `execute(input)`

### Claude-style tool format

```ts
const claudeTools = createBuyerTools(sdk).map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema
}));
```

### OpenAI-style tool format

```ts
const openAITools = createBuyerTools(sdk).map((tool) => ({
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
const tools = createBuyerTools(sdk);
const tool = tools.find((entry) => entry.name === "tyrpay_post_task");

if (!tool) {
  throw new Error("buyer tool not found");
}

const result = await tool.execute({
  seller: "0x1111111111111111111111111111111111111111",
  token: "0x2222222222222222222222222222222222222222",
  amount: "1000000",
  deadline: "1760000000000",
  expectations: {
    acceptedHosts: ["api.openai.com"],
    acceptedPaths: ["/v1/chat/completions"],
    acceptedMethods: ["POST"],
    acceptedModels: ["gpt-4o-mini"],
    requireNonZeroMinUsage: true
  }
});
```

## Tool Semantics

### `tyrpay_post_task`

Complete buyer happy-path orchestration in one tool call:

1. create the task intent on-chain
2. wait for seller commitment submission
3. validate the commitment against buyer expectations
4. fund the task

Use this as the primary buyer entrypoint when the agent is creating a new task.

Returns:

- `taskId`: on-chain task identifier
- `taskNonce`: on-chain task nonce assigned at task creation
- `createTxHash`: transaction hash for `createTaskIntent`
- `fundTxHash`: transaction hash for `fundTask`
- `commitmentHash`: seller commitment hash accepted by the buyer flow
- `commitmentURI`: seller commitment URI accepted by the buyer flow
- `userStatus`: buyer-facing status, currently `IN_PROGRESS`
- `userMessage`: buyer-facing explanation of what happens next

### `tyrpay_check_task`

Returns the current on-chain task plus both machine-friendly and buyer-facing status fields.

Derived protocol statuses currently exposed:

- `EXECUTING`
- `EXPIRED`

Buyer-facing statuses currently exposed:

- `WAITING_FOR_SELLER`
- `READY_TO_FUND`
- `IN_PROGRESS`
- `AWAITING_VERIFICATION`
- `COMPLETED`
- `REFUNDED`
- `EXPIRED`

Returns:

- all normalized on-chain task fields from `BuyerSdk.getTask(...)`
- `derivedStatus`: current derived status used for buyer-facing monitoring
- `userStatus`: simplified status for end-user messaging
- `userMessage`: short explanation of the current stage

### `tyrpay_refund_task`

Requests a refund through one of the two timeout paths:

- `proof_submission_deadline`
- `verification_timeout`

Returns:

- `txHash`: refund transaction hash
- `userStatus`: currently `REFUND_IN_PROGRESS`
- `userMessage`: short explanation that refund was requested and still needs confirmation

### `tyrpay_list_tasks`

Batch status lookup for multiple task IDs.

Returns:

- an array of task records in the same order as the input `taskIds`
- each record contains all normalized task fields plus `derivedStatus`, `userStatus`, and `userMessage`

## Notes For Agent Authors

- `tyrpay_post_task` already performs `validateCommitment` before funding.
- Pass buyer-side expectations whenever the upstream API, method, model, or
  verifier must be constrained.
- `deadline` is the execution deadline in Unix milliseconds, not a human string.

## Related Packages

- `@tyrpay/buyer-sdk`: on-chain buyer workflow and validation
- `@tyrpay/agent-kit`: prebuilt Claude/OpenAI wrappers if you do not want to map
  the tool shape yourself
