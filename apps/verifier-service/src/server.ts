import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { JsonRpcProvider, Wallet } from "ethers";

import { normalizeAddress } from "@tyrpay/sdk-core";
import { ZeroGStorageAdapter, createZeroGStorageTransport } from "@tyrpay/storage-adapter";
import { ReclaimZkTlsAdapter, ZeroGTeeTlsAdapter } from "@tyrpay/zktls-adapter";
import {
  CentralizedVerifier,
  EthersSettlementTaskReader,
  InMemoryProofConsumptionRegistry,
  createVerifierHttpServer
} from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required.`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function normalizePrivateKey(input: string): string {
  return input.startsWith("0x") ? input : `0x${input}`;
}

async function main() {
  const rpcUrl = requireEnv("ZERO_G_EVM_RPC");
  const settlementAddress = normalizeAddress(requireEnv("SETTLEMENT_CONTRACT"), "SETTLEMENT_CONTRACT");
  const verifierPrivateKey = normalizePrivateKey(requireEnv("VERIFIER_PRIVATE_KEY"));
  const port = parseInt(optionalEnv("VERIFIER_PORT") ?? "3000", 10);
  const indexerRpc = requireEnv("ZERO_G_INDEXER_RPC");

  const provider = new JsonRpcProvider(rpcUrl);
  const verifierWallet = new Wallet(verifierPrivateKey, provider);
  const network = await provider.getNetwork();
  const chainId = optionalEnv("CHAIN_ID") ?? network.chainId.toString();

  console.log(`[verifier] Chain ID: ${chainId}`);
  console.log(`[verifier] Settlement: ${settlementAddress}`);
  console.log(`[verifier] Verifier address: ${verifierWallet.address}`);

  const storage = new ZeroGStorageAdapter({
    transport: createZeroGStorageTransport({
      indexer: indexerRpc,
      evmRpc: rpcUrl,
      signer: verifierWallet as never,
      withProof: true
    })
  });

  const zktlsAdapters = [new ReclaimZkTlsAdapter(), new ZeroGTeeTlsAdapter()];

  const consumptionRegistry = new InMemoryProofConsumptionRegistry();

  const verifierService = new CentralizedVerifier({
    settlement: new EthersSettlementTaskReader({
      settlementAddress,
      runner: verifierWallet as never,
      chainId
    }),
    storage,
    signer: verifierWallet as unknown as import("./index.js").VerificationReportSigner,
    zktlsAdapters: zktlsAdapters as unknown as import("./index.js").RawProofVerifier[],
    consumptionRegistry
  });

  const server = createVerifierHttpServer({ verifier: verifierService });

  server.listen(port, () => {
    console.log(`[verifier] HTTP server listening on http://127.0.0.1:${port}`);
    console.log(`[verifier] POST /verify  - verify a task`);
    console.log(`[verifier] GET  /health  - health check`);
  });
}

main().catch((error) => {
  console.error("[verifier] Failed to start:", error);
  process.exit(1);
});
