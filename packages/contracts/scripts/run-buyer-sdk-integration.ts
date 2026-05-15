import { ethers } from "hardhat";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const module = await import(
    pathToFileURL(path.resolve(__dirname, "../../buyer-sdk/tests/buyer-sdk.integration.ts")).href
  ) as {
    runBuyerSdkIntegration(ethersLike: typeof ethers): Promise<void>;
  };
  await module.runBuyerSdkIntegration(ethers);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
