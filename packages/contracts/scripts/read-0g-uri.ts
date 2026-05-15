import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import * as dotenv from "dotenv";
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { parseZeroGStorageUri } from "@tyrpay/storage-adapter";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

async function main() {
  const uri = process.env.ZERO_G_URI?.trim() || process.argv[2]?.trim();
  const outputPath = process.env.ZERO_G_OUTPUT_PATH?.trim() || process.argv[3]?.trim();

  if (!uri) {
    throw new Error("Usage: ZERO_G_URI=<0g://...> [ZERO_G_OUTPUT_PATH=output.json] hardhat run scripts/read-0g-uri.ts --network testnet");
  }

  const indexerRpc = requireEnv("ZERO_G_INDEXER_RPC");
  const { rootHash, hash, namespace, txHash } = parseZeroGStorageUri(uri);
  const indexer = new Indexer(indexerRpc);
  const targetPath = outputPath ? path.resolve(process.cwd(), outputPath) : path.resolve(process.cwd(), `.tmp-${rootHash}.json`);

  await rm(targetPath, { force: true });

  const error = await indexer.download(rootHash, targetPath, true);
  if (error) {
    throw error;
  }

  const payload = await readFile(targetPath, "utf8");
  const parsed = JSON.parse(payload);

  console.log(`URI: ${uri}`);
  console.log(`Namespace: ${namespace}`);
  console.log(`TyrPay Hash: ${hash}`);
  console.log(`Root Hash: ${rootHash}`);
  if (txHash) {
    console.log(`Tx Hash: ${txHash}`);
  }
  console.log(`Saved To: ${targetPath}`);
  console.log(JSON.stringify(parsed, null, 2));
}

function requireEnv(name: "ZERO_G_INDEXER_RPC"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
