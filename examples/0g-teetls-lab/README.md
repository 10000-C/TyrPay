# 0G TeeTLS Lab

Minimal experiment package for validating 0G TeeTLS request flow and whether a provider returns the three fields TyrPay cares about most:

- endpoint
- model
- usage

## Commands

```bash
corepack pnpm --filter @tyrpay/0g-teetls-lab inspect
corepack pnpm --filter @tyrpay/0g-teetls-lab live
```

## Environment

The script loads the repo root `.env` automatically, then falls back to process env.

Optional variables:

```bash
ZERO_G_EVM_RPC=https://evmrpc-testnet.0g.ai
ZERO_G_COMPUTE_PRIVATE_KEY=0x...
ZERO_G_PROVIDER_ADDRESS=0x69Eb5a0BD7d0f4bF39eD5CE9Bd3376c61863aE08
ZERO_G_QUERY=Reply with one short sentence about TyrPay.
ZERO_G_OPENAI_PATH=/chat/completions
ZERO_G_BOOTSTRAP_LEDGER=0
ZERO_G_ACK_PROVIDER=0
ZERO_G_TRANSFER_PROVIDER_OG=1
```

## What `live` prints

- `endpoint` from `getServiceMetadata`
- `modelFromMetadata`
- `modelFromResponse`
- `usage`
- `chatId`
- `processResponseResult`
- request header keys returned by the official SDK

## Notes

- `getServiceMetadata` is readable before a funded 0G inference account exists.
- `getRequestHeaders` requires the caller to have a 0G ledger account and a funded provider sub-account.
- If you want the script to spend funds and try the full flow, set:

```bash
ZERO_G_BOOTSTRAP_LEDGER=1
ZERO_G_ACK_PROVIDER=1
ZERO_G_TRANSFER_PROVIDER_OG=1
```
