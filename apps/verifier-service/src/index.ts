import { buildService } from "./service.js";
import type { VerifierServiceConfig } from "./types.js";

export { buildService } from "./service.js";
export { verifyProofBundle } from "./verify.js";
export type { VerifierServiceConfig, VerificationRequest, VerificationResponse, VerificationStatus } from "./types.js";

async function main() {
  const config: VerifierServiceConfig = {
    port: parseInt(process.env["PORT"] ?? "3000", 10),
    host: process.env["HOST"] ?? "0.0.0.0",
    contractAddress: (process.env["CONTRACT_ADDRESS"] ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    verifierPrivateKey: (process.env["VERIFIER_PRIVATE_KEY"] ?? "") as `0x${string}`,
    chainId: parseInt(process.env["CHAIN_ID"] ?? "1", 10),
    storage: null as any, // Injected externally
    zktls: null as any,   // Injected externally
  };

  const app = await buildService(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Verifier service listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch(console.error);
