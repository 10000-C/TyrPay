import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ethers, network } from "hardhat";

const DEFAULT_GRACE_PERIOD_MS = 15n * 60n * 1000n;
const DEFAULT_VERIFICATION_TIMEOUT_MS = 60n * 60n * 1000n;
const configuredAllowedTokens = (process.env.ALLOWED_TOKENS ?? "")
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`Deploying contracts with ${deployer.address} on ${network.name} (${chainId})`);

  const verifierRegistryFactory = await ethers.getContractFactory("VerifierRegistry");
  const verifierRegistry = await verifierRegistryFactory.deploy(deployer.address);
  await verifierRegistry.waitForDeployment();

  const settlementFactory = await ethers.getContractFactory("TyrPaySettlement");
  const settlement = await settlementFactory.deploy(
    await verifierRegistry.getAddress(),
    DEFAULT_GRACE_PERIOD_MS,
    DEFAULT_VERIFICATION_TIMEOUT_MS
  );
  await settlement.waitForDeployment();

  let mockTokenAddress: string | null = null;

  if (network.name === "hardhat" || network.name === "localhost") {
    const mockTokenFactory = await ethers.getContractFactory("MockERC20");
    const mockToken = await mockTokenFactory.deploy(
      "TyrPay Mock USD",
      "fpUSD",
      deployer.address,
      1_000_000_000n
    );
    await mockToken.waitForDeployment();
    mockTokenAddress = await mockToken.getAddress();
  }

  const allowedTokens = [...configuredAllowedTokens];
  if (mockTokenAddress) {
    allowedTokens.push(mockTokenAddress);
  }
  for (const token of allowedTokens) {
    await (await settlement.setAllowedToken(token, true)).wait();
  }

  const output = {
    chainId: chainId.toString(),
    network: network.name,
    deployer: deployer.address,
    verifierRegistry: await verifierRegistry.getAddress(),
    settlement: await settlement.getAddress(),
    mockToken: mockTokenAddress,
    allowedTokens
  };

  const outputDir = path.join(__dirname, "..", "deployments");
  await mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `addresses.${chainId.toString()}.json`);
  await writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`Deployment addresses written to ${outputPath}`);
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
