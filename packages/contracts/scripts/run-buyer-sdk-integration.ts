import { ethers } from "hardhat";

async function main() {
  const module = await import("../../buyer-sdk/tests/buyer-sdk.integration.ts");
  await module.runBuyerSdkIntegration(ethers);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
