import { readFile } from "node:fs/promises";
import path from "node:path";

import { ethers, network } from "hardhat";

import {
  FulfillPaySettlement,
  FulfillPaySettlement__factory,
  MockERC20,
  MockERC20__factory,
  VerifierRegistry,
  VerifierRegistry__factory
} from "../typechain-types";

type DeploymentFile = {
  chainId: string;
  verifierRegistry: string;
  settlement: string;
  mockToken: string | null;
};

type ReportInput = {
  taskId: string;
  buyer: string;
  seller: string;
  commitmentHash: string;
  proofBundleHash: string;
  passed: boolean;
  settlementAction: number;
  settlementAmount: bigint;
  verifiedAt: bigint;
};

async function main() {
  if (network.name !== "localhost") {
    throw new Error("smoke-local.ts is intended for the localhost network only.");
  }

  const [owner, buyer, seller, verifier] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deploymentsPath = path.join(__dirname, "..", "deployments", `addresses.${chainId.toString()}.json`);
  const deployments = JSON.parse(await readFile(deploymentsPath, "utf8")) as DeploymentFile;

  if (!deployments.mockToken) {
    throw new Error("Deployment file does not contain a mockToken address.");
  }

  const verifierRegistry = VerifierRegistry__factory.connect(deployments.verifierRegistry, owner) as VerifierRegistry;
  const settlement = FulfillPaySettlement__factory.connect(deployments.settlement, owner) as FulfillPaySettlement;
  const mockToken = MockERC20__factory.connect(deployments.mockToken, owner) as MockERC20;

  const settlementAddress = await ethers.resolveAddress(settlement);
  const proofSubmissionGracePeriodMs = await settlement.proofSubmissionGracePeriodMs();
  const verificationTimeoutMs = await settlement.verificationTimeoutMs();

  if (!(await verifierRegistry.isVerifier(verifier.address))) {
    await (await verifierRegistry.addVerifier(verifier.address)).wait();
  }

  await (await mockToken.mint(buyer.address, 5_000_000n)).wait();
  await (await mockToken.connect(buyer).approve(settlementAddress, 5_000_000n)).wait();

  console.log(`Running smoke tests on chain ${chainId.toString()} against ${settlementAddress}`);

  const passTask = await createFundedTask({
    settlement,
    buyer,
    seller,
    tokenAddress: deployments.mockToken
  });
  const passProofBundleHash = ethers.keccak256(ethers.toUtf8Bytes("smoke/pass/proof-bundle"));
  await (
    await settlement.connect(seller).submitProofBundle(passTask.taskId, passProofBundleHash, "ipfs://smoke/pass/proof-bundle")
  ).wait();
  const passReport: ReportInput = {
    taskId: passTask.taskId,
    buyer: buyer.address,
    seller: seller.address,
    commitmentHash: passTask.commitmentHash,
    proofBundleHash: passProofBundleHash,
    passed: true,
    settlementAction: 1,
    settlementAmount: 1_000_000n,
    verifiedAt: await settlement.currentTimeMs()
  };
  const passSignature = await signReport(verifier, settlementAddress, chainId, passReport);
  await (await settlement.settle(passReport, passSignature, ethers.keccak256(ethers.toUtf8Bytes("smoke/pass/report")))).wait();
  const sellerBalanceAfterPass = await mockToken.balanceOf(seller.address);
  console.log(`PASS flow settled. Seller balance is now ${sellerBalanceAfterPass.toString()}.`);

  const failTask = await createFundedTask({
    settlement,
    buyer,
    seller,
    tokenAddress: deployments.mockToken,
    commitmentSalt: "smoke/fail/commitment"
  });
  const failProofBundleHash = ethers.keccak256(ethers.toUtf8Bytes("smoke/fail/proof-bundle"));
  await (
    await settlement.connect(seller).submitProofBundle(failTask.taskId, failProofBundleHash, "ipfs://smoke/fail/proof-bundle")
  ).wait();
  const failReport: ReportInput = {
    taskId: failTask.taskId,
    buyer: buyer.address,
    seller: seller.address,
    commitmentHash: failTask.commitmentHash,
    proofBundleHash: failProofBundleHash,
    passed: false,
    settlementAction: 2,
    settlementAmount: 1_000_000n,
    verifiedAt: await settlement.currentTimeMs()
  };
  const failSignature = await signReport(verifier, settlementAddress, chainId, failReport);
  await (await settlement.settle(failReport, failSignature, ethers.keccak256(ethers.toUtf8Bytes("smoke/fail/report")))).wait();
  const refundedTask = await settlement.getTask(failTask.taskId);
  console.log(`FAIL flow refunded. Task status is ${refundedTask.status.toString()}.`);

  const timeoutTask = await createFundedTask({
    settlement,
    buyer,
    seller,
    tokenAddress: deployments.mockToken,
    commitmentSalt: "smoke/timeout/commitment"
  });
  const timeoutProofBundleHash = ethers.keccak256(ethers.toUtf8Bytes("smoke/timeout/proof-bundle"));
  await (
    await settlement
      .connect(seller)
      .submitProofBundle(timeoutTask.taskId, timeoutProofBundleHash, "ipfs://smoke/timeout/proof-bundle")
  ).wait();
  await increaseTimeSeconds(Number(verificationTimeoutMs / 1000n) + 1);
  await (await settlement.refundAfterVerificationTimeout(timeoutTask.taskId)).wait();
  const timeoutRefundedTask = await settlement.getTask(timeoutTask.taskId);
  console.log(`Verification-timeout refund succeeded. Task status is ${timeoutRefundedTask.status.toString()}.`);

  const lateProofTask = await createFundedTask({
    settlement,
    buyer,
    seller,
    tokenAddress: deployments.mockToken,
    commitmentSalt: "smoke/late-proof/commitment"
  });
  const lateProofDeadline = lateProofTask.deadlineMs;
  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Could not load latest block.");
  }
  const targetTimestampSeconds = Number((lateProofDeadline + proofSubmissionGracePeriodMs) / 1000n) + 1;
  const deltaSeconds = Math.max(0, targetTimestampSeconds - latestBlock.timestamp);
  await increaseTimeSeconds(deltaSeconds);
  await (await settlement.refundAfterProofSubmissionDeadline(lateProofTask.taskId)).wait();
  const lateProofRefundedTask = await settlement.getTask(lateProofTask.taskId);
  console.log(`Proof-submission-timeout refund succeeded. Task status is ${lateProofRefundedTask.status.toString()}.`);
}

async function createFundedTask({
  settlement,
  buyer,
  seller,
  tokenAddress,
  commitmentSalt = "smoke/default/commitment"
}: {
  settlement: FulfillPaySettlement;
  buyer: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  seller: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  tokenAddress: string;
  commitmentSalt?: string;
}) {
  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Could not load latest block.");
  }

  const deadlineMs = BigInt(latestBlock.timestamp + 3600) * 1000n;
  const amount = 1_000_000n;
  const args = [seller.address, tokenAddress, amount, deadlineMs, ethers.ZeroHash, "ipfs://smoke/task"] as const;
  const [taskId] = await settlement.connect(buyer).createTaskIntent.staticCall(...args);
  await (await settlement.connect(buyer).createTaskIntent(...args)).wait();

  const commitmentHash = ethers.keccak256(ethers.toUtf8Bytes(commitmentSalt));
  await (await settlement.connect(seller).submitCommitment(taskId, commitmentHash, `ipfs://${commitmentSalt}`)).wait();
  await (await settlement.connect(buyer).fundTask(taskId)).wait();

  return {
    taskId,
    commitmentHash,
    deadlineMs
  };
}

async function signReport(
  verifier: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  settlementAddress: string,
  chainId: bigint,
  report: ReportInput
) {
  return verifier.signTypedData(
    {
      name: "FulfillPay",
      version: "1",
      chainId,
      verifyingContract: settlementAddress
    },
    {
      VerificationReport: [
        { name: "taskId", type: "bytes32" },
        { name: "buyer", type: "address" },
        { name: "seller", type: "address" },
        { name: "commitmentHash", type: "bytes32" },
        { name: "proofBundleHash", type: "bytes32" },
        { name: "passed", type: "bool" },
        { name: "settlementAction", type: "uint8" },
        { name: "settlementAmount", type: "uint256" },
        { name: "verifiedAt", type: "uint256" }
      ]
    },
    report
  );
}

async function increaseTimeSeconds(seconds: number) {
  if (seconds <= 0) {
    await ethers.provider.send("evm_mine", []);
    return;
  }

  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
