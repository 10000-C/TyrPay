import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as dotenv from "dotenv";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { JsonRpcProvider, Wallet, formatEther } from "ethers";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

type WalletCase = {
  label: "buyer" | "seller" | "verifier" | "owner";
  envKey: "BUYER_PRIVATE_KEY" | "SELLER_PRIVATE_KEY" | "VERIFIER_PRIVATE_KEY" | "CONTRACT_OWNER_PRIVATE_KEY";
};

const WALLET_CASES: WalletCase[] = [
  { label: "buyer", envKey: "BUYER_PRIVATE_KEY" },
  { label: "seller", envKey: "SELLER_PRIVATE_KEY" },
  { label: "verifier", envKey: "VERIFIER_PRIVATE_KEY" },
  { label: "owner", envKey: "CONTRACT_OWNER_PRIVATE_KEY" }
];

async function main() {
  const evmRpc = requireEnv("ZERO_G_EVM_RPC");
  const indexerRpc = requireEnv("ZERO_G_INDEXER_RPC");
  const provider = new JsonRpcProvider(evmRpc);
  const network = await provider.getNetwork();
  const envChainId = process.env.CHAIN_ID?.trim();

  if (envChainId && BigInt(envChainId) !== network.chainId) {
    throw new Error(`CHAIN_ID=${envChainId} does not match provider chainId=${network.chainId.toString()}.`);
  }

  const indexer = new Indexer(indexerRpc);
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "fulfillpay-0g-sdk-"));

  try {
    console.log(`Testing official 0G SDK on chain ${network.chainId.toString()}.`);
    console.log(`EVM RPC: ${evmRpc}`);
    console.log(`Indexer RPC: ${indexerRpc}`);

    for (const walletCase of WALLET_CASES) {
      await runWalletCase(indexer, provider, evmRpc, tempDirectory, walletCase);
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function runWalletCase(
  indexer: Indexer,
  provider: JsonRpcProvider,
  evmRpc: string,
  tempDirectory: string,
  walletCase: WalletCase
) {
  const signer = new Wallet(normalizePrivateKey(requireEnv(walletCase.envKey)), provider);
  const balance = await provider.getBalance(signer.address);
  const payload = buildPayload(walletCase.label, signer.address);
  const file = new MemData(Buffer.from(payload, "utf8"));

  console.log(`\n[${walletCase.label}] signer=${signer.address} balance=${formatEther(balance)}`);

  const [result, error] = await indexer.upload(file, evmRpc, signer);
  const uploadResult = toSingleUploadResult(result);
  if (error || !uploadResult || !uploadResult.rootHash || !uploadResult.txHash) {
    throw new Error(
      `[${walletCase.label}] upload failed: ${error ? String(error) : "missing upload result"}`
    );
  }

  const outputPath = path.join(tempDirectory, `${walletCase.label}-${uploadResult.rootHash.slice(2, 10)}.json`);
  const downloadError = await indexer.download(uploadResult.rootHash, outputPath, true);
  if (downloadError) {
    throw new Error(`[${walletCase.label}] download failed: ${String(downloadError)}`);
  }

  const restored = await readFile(outputPath, "utf8");
  assert.equal(restored, payload, `[${walletCase.label}] downloaded payload mismatch`);

  console.log(`[${walletCase.label}] rootHash=${uploadResult.rootHash}`);
  console.log(`[${walletCase.label}] txHash=${uploadResult.txHash}`);
  console.log(`[${walletCase.label}] downloaded=${outputPath}`);
}

function buildPayload(label: WalletCase["label"], signerAddress: string): string {
  return JSON.stringify(
    {
      kind: "fulfillpay-0g-sdk-smoke",
      wallet: label,
      signer: signerAddress,
      timestamp: new Date().toISOString()
    },
    null,
    2
  );
}

function requireEnv(name: WalletCase["envKey"] | "ZERO_G_EVM_RPC" | "ZERO_G_INDEXER_RPC"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function normalizePrivateKey(input: string): string {
  return input.startsWith("0x") ? input : `0x${input}`;
}

function toSingleUploadResult(
  result:
    | { txHash: string; rootHash: string; txSeq: number }
    | { txHashes: string[]; rootHashes: string[]; txSeqs: number[] }
    | null
    | undefined
) {
  if (!result || "rootHashes" in result || "txHashes" in result || "txSeqs" in result) {
    return null;
  }

  return result;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
