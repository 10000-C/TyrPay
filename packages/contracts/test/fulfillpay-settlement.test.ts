import { readFileSync } from "node:fs";
import path from "node:path";

import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  FulfillPaySettlement,
  FulfillPaySettlement__factory,
  MockERC20,
  MockERC20__factory,
  VerifierRegistry,
  VerifierRegistry__factory
} from "../typechain-types";

type VectorFile = {
  domain: {
    name: string;
    version: string;
    chainId: string;
    verifyingContract: string;
  };
  message: {
    taskId: string;
    buyer: string;
    seller: string;
    commitmentHash: string;
    proofBundleHash: string;
    passed: boolean;
    settlementAction: number;
    settlementAmount: string;
    verifiedAt: string;
    reportHash: string;
  };
  typeHashes: {
    domainSeparator: string;
    digest: string;
    structHash: string;
  };
};

type HashVectorFile = {
  hashes: {
    commitmentHash: string;
    proofBundleHash: string;
    verificationReportHash: string;
  };
};

function loadJson<T>(relativePath: string): T {
  const absolutePath = path.join(__dirname, "..", "..", "..", "test", relativePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

type DeployFixtureResult = Awaited<ReturnType<typeof deployFixture>>;

async function addressOf(contract: Parameters<typeof ethers.resolveAddress>[0]): Promise<string> {
  return ethers.resolveAddress(contract);
}

async function deployFixture() {
  const [owner, buyer, seller, verifier, outsider] = await ethers.getSigners();

  const verifierRegistryFactory = new VerifierRegistry__factory(owner);
  const verifierRegistry = (await verifierRegistryFactory.deploy(owner.address)) as VerifierRegistry;
  await verifierRegistry.waitForDeployment();
  await verifierRegistry.addVerifier(verifier.address);

  const gracePeriodMs = 15n * 60n * 1000n;
  const verificationTimeoutMs = 60n * 60n * 1000n;
  const verifierRegistryAddress = await addressOf(verifierRegistry);

  const settlementFactory = new FulfillPaySettlement__factory(owner);
  const settlement = (await settlementFactory.deploy(
    verifierRegistryAddress,
    gracePeriodMs,
    verificationTimeoutMs
  )) as FulfillPaySettlement;
  await settlement.waitForDeployment();

  const mockTokenFactory = new MockERC20__factory(owner);
  const mockToken = (await mockTokenFactory.deploy("FulfillPay Mock USD", "fpUSD", owner.address, 0)) as MockERC20;
  await mockToken.waitForDeployment();
  const settlementAddress = await addressOf(settlement);
  await settlement.setAllowedToken(await addressOf(mockToken), true);

  await mockToken.mint(buyer.address, 10_000_000n);
  await mockToken.connect(buyer).approve(settlementAddress, 10_000_000n);

  return {
    owner,
    buyer,
    seller,
    verifier,
    outsider,
    verifierRegistry,
    settlement,
    mockToken,
    gracePeriodMs,
    verificationTimeoutMs
  };
}

async function createFundedTaskOnFixture(
  fixture: DeployFixtureResult,
  options: {
    commitmentHash?: string;
  } = {}
) {
  const current = await time.latest();
  const deadlineMs = BigInt(current + 3600) * 1000n;
  const metadataHash = ethers.ZeroHash;
  const metadataUri = "ipfs://fulfillpay/task/basic";
  const tokenAddress = await addressOf(fixture.mockToken);
  const args = [
    fixture.seller.address,
    tokenAddress,
    1_000_000n,
    deadlineMs,
    metadataHash,
    metadataUri
  ] as const;

  const [taskId] = await fixture.settlement.connect(fixture.buyer).createTaskIntent.staticCall(...args);
  const createTx = await fixture.settlement.connect(fixture.buyer).createTaskIntent(...args);
  await createTx.wait();
  const commitmentHash = options.commitmentHash ?? ethers.keccak256(ethers.toUtf8Bytes("commitment/basic"));

  await fixture.settlement
    .connect(fixture.seller)
    .submitCommitment(taskId, commitmentHash, "ipfs://fulfillpay/commitments/basic");
  await fixture.settlement.connect(fixture.buyer).fundTask(taskId);

  return {
    ...fixture,
    taskId,
    deadlineMs,
    commitmentHash
  };
}

async function createFundedTask(options: { commitmentHash?: string } = {}) {
  const fixture = await loadFixture(deployFixture);
  return createFundedTaskOnFixture(fixture, options);
}

async function createProofSubmittedTask(
  options: {
    fixture?: DeployFixtureResult;
    commitmentHash?: string;
    proofBundleHash?: string;
  } = {}
) {
  const fixture = options.fixture ?? (await loadFixture(deployFixture));
  const fundedTask = await createFundedTaskOnFixture(fixture, {
    commitmentHash: options.commitmentHash
  });
  const bundleHash = options.proofBundleHash ?? ethers.keccak256(ethers.toUtf8Bytes("proof-bundle/basic"));

  await fundedTask.settlement
    .connect(fundedTask.seller)
    .submitProofBundle(fundedTask.taskId, bundleHash, "ipfs://fulfillpay/proof-bundles/basic");

  return {
    ...fundedTask,
    proofBundleHash: bundleHash
  };
}

async function signReport(
  verifier: Awaited<ReturnType<typeof deployFixture>>["verifier"],
  settlementAddress: string,
  chainId: bigint,
  report: {
    taskId: string;
    buyer: string;
    seller: string;
    commitmentHash: string;
    proofBundleHash: string;
    passed: boolean;
    settlementAction: number;
    settlementAmount: bigint;
    verifiedAt: bigint;
    reportHash: string;
  }
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
        { name: "verifiedAt", type: "uint256" },
        { name: "reportHash", type: "bytes32" }
      ]
    },
    report
  );
}

describe("FulfillPaySettlement", function () {
  it("matches the EIP-712 vector and contract hashing helpers", async function () {
    const vector = loadJson<VectorFile>(path.join("vectors", "eip712", "verification-report-pass-basic.json"));
    const hashVector = loadJson<HashVectorFile>(path.join("vectors", "hashing", "pass-basic.json"));
    const fixture = await loadFixture(deployFixture);

    const types: Record<string, Array<{ name: string; type: string }>> = {
      VerificationReport: [
        { name: "taskId", type: "bytes32" },
        { name: "buyer", type: "address" },
        { name: "seller", type: "address" },
        { name: "commitmentHash", type: "bytes32" },
        { name: "proofBundleHash", type: "bytes32" },
        { name: "passed", type: "bool" },
        { name: "settlementAction", type: "uint8" },
        { name: "settlementAmount", type: "uint256" },
        { name: "verifiedAt", type: "uint256" },
        { name: "reportHash", type: "bytes32" }
      ]
    };

    const vectorStructHash = ethers.TypedDataEncoder.hashStruct("VerificationReport", types, {
      ...vector.message,
      settlementAmount: BigInt(vector.message.settlementAmount),
      verifiedAt: BigInt(vector.message.verifiedAt)
    });
    const vectorDigest = ethers.TypedDataEncoder.hash(
      vector.domain,
      types,
      {
        ...vector.message,
        settlementAmount: BigInt(vector.message.settlementAmount),
        verifiedAt: BigInt(vector.message.verifiedAt)
      }
    );

    expect(vectorStructHash).to.equal(vector.typeHashes.structHash);
    expect(vectorDigest).to.equal(vector.typeHashes.digest);
    expect(hashVector.hashes.commitmentHash).to.equal(vector.message.commitmentHash);
    expect(hashVector.hashes.proofBundleHash).to.equal(vector.message.proofBundleHash);

    const actualSettlementAddress = await addressOf(fixture.settlement);
    const actualChainId = (await ethers.provider.getNetwork()).chainId;
    const report = {
      ...vector.message,
      settlementAmount: BigInt(vector.message.settlementAmount),
      verifiedAt: BigInt(vector.message.verifiedAt)
    };
    const contractStructHash = await fixture.settlement.hashVerificationReport(report);
    const contractDigest = await fixture.settlement.hashTypedVerificationReport(report);
    const ethersDigest = ethers.TypedDataEncoder.hash(
      {
        name: "FulfillPay",
        version: "1",
        chainId: actualChainId,
        verifyingContract: actualSettlementAddress
      },
      types,
      report
    );

    expect(contractStructHash).to.equal(vector.typeHashes.structHash);
    expect(contractDigest).to.equal(ethersDigest);
  });

  it("settles a passing task and releases escrow to the seller", async function () {
    const task = await createProofSubmittedTask();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const settlementAddress = await addressOf(task.settlement);
    const verifiedAt = BigInt(await task.settlement.currentTimeMs());
    const report = {
      taskId: task.taskId,
      buyer: task.buyer.address,
      seller: task.seller.address,
      commitmentHash: task.commitmentHash,
      proofBundleHash: task.proofBundleHash,
      passed: true,
      settlementAction: 1,
      settlementAmount: 1_000_000n,
      verifiedAt,
      reportHash: ethers.keccak256(ethers.toUtf8Bytes("report/pass"))
    };
    const signature = await signReport(task.verifier, settlementAddress, chainId, report);

    await expect(task.settlement.settle(report, signature)).to.emit(task.settlement, "TaskSettled");

    const storedTask = await task.settlement.getTask(task.taskId);
    expect(storedTask.status).to.equal(4n);
    expect(await task.mockToken.balanceOf(task.seller.address)).to.equal(1_000_000n);
    expect(await task.mockToken.balanceOf(await addressOf(task.settlement))).to.equal(0n);
    expect(await task.settlement.usedProofBundleHash(task.proofBundleHash)).to.equal(true);
  });

  it("refunds a failing report and stores the fixture hashes cleanly", async function () {
    const hashVector = loadJson<HashVectorFile>(path.join("vectors", "hashing", "pass-basic.json"));
    const task = await createProofSubmittedTask({
      commitmentHash: hashVector.hashes.commitmentHash,
      proofBundleHash: hashVector.hashes.proofBundleHash
    });

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const report = {
      taskId: task.taskId,
      buyer: task.buyer.address,
      seller: task.seller.address,
      commitmentHash: hashVector.hashes.commitmentHash,
      proofBundleHash: hashVector.hashes.proofBundleHash,
      passed: false,
      settlementAction: 2,
      settlementAmount: 1_000_000n,
      verifiedAt: BigInt(await task.settlement.currentTimeMs()),
      reportHash: hashVector.hashes.verificationReportHash
    };
    const signature = await signReport(task.verifier, await addressOf(task.settlement), chainId, report);

    await expect(task.settlement.settle(report, signature)).to.emit(task.settlement, "TaskRefunded");

    const storedTask = await task.settlement.getTask(task.taskId);
    expect(storedTask.commitmentHash).to.equal(hashVector.hashes.commitmentHash);
    expect(storedTask.proofBundleHash).to.equal(hashVector.hashes.proofBundleHash);
    expect(storedTask.reportHash).to.equal(hashVector.hashes.verificationReportHash);
    expect(storedTask.status).to.equal(5n);
    expect(await task.mockToken.balanceOf(task.buyer.address)).to.equal(10_000_000n);
  });

  it("rejects commitment submission by a non-seller", async function () {
    const fixture = await loadFixture(deployFixture);
    const current = await time.latest();
    const deadlineMs = BigInt(current + 3600) * 1000n;
    const args = [
      fixture.seller.address,
      await addressOf(fixture.mockToken),
      1_000_000n,
      deadlineMs,
      ethers.ZeroHash,
      ""
    ] as const;
    const [taskId] = await fixture.settlement.connect(fixture.buyer).createTaskIntent.staticCall(...args);
    await fixture.settlement.connect(fixture.buyer).createTaskIntent(...args);

    await expect(
      fixture.settlement
        .connect(fixture.outsider)
        .submitCommitment(taskId, ethers.keccak256(ethers.toUtf8Bytes("bad")), "ipfs://bad")
    ).to.be.revertedWithCustomError(fixture.settlement, "OnlySeller");
  });

  it("rejects proof submission before funding and settlement before proof", async function () {
    const fixture = await loadFixture(deployFixture);
    const current = await time.latest();
    const deadlineMs = BigInt(current + 3600) * 1000n;
    const args = [
      fixture.seller.address,
      await addressOf(fixture.mockToken),
      1_000_000n,
      deadlineMs,
      ethers.ZeroHash,
      ""
    ] as const;
    const [taskId] = await fixture.settlement.connect(fixture.buyer).createTaskIntent.staticCall(...args);
    await fixture.settlement.connect(fixture.buyer).createTaskIntent(...args);

    await fixture.settlement
      .connect(fixture.seller)
      .submitCommitment(taskId, ethers.keccak256(ethers.toUtf8Bytes("commitment")), "ipfs://commitment");

    await expect(
      fixture.settlement
        .connect(fixture.seller)
        .submitProofBundle(taskId, ethers.keccak256(ethers.toUtf8Bytes("bundle")), "ipfs://bundle")
    ).to.be.revertedWithCustomError(fixture.settlement, "InvalidTaskState");

    const report = {
      taskId,
      buyer: fixture.buyer.address,
      seller: fixture.seller.address,
      commitmentHash: ethers.keccak256(ethers.toUtf8Bytes("commitment")),
      proofBundleHash: ethers.keccak256(ethers.toUtf8Bytes("bundle")),
      passed: true,
      settlementAction: 1,
      settlementAmount: 1_000_000n,
      verifiedAt: BigInt(await fixture.settlement.currentTimeMs()),
      reportHash: ethers.keccak256(ethers.toUtf8Bytes("report"))
    };
    const signature = await signReport(
      fixture.verifier,
      await addressOf(fixture.settlement),
      (await ethers.provider.getNetwork()).chainId,
      report
    );

    await expect(
      fixture.settlement.settle(report, signature)
    ).to.be.revertedWithCustomError(fixture.settlement, "InvalidTaskState");
  });

  it("rejects an unauthorized verifier signature and keeps the task pending", async function () {
    const task = await createProofSubmittedTask();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const report = {
      taskId: task.taskId,
      buyer: task.buyer.address,
      seller: task.seller.address,
      commitmentHash: task.commitmentHash,
      proofBundleHash: task.proofBundleHash,
      passed: false,
      settlementAction: 2,
      settlementAmount: 1_000_000n,
      verifiedAt: BigInt(await task.settlement.currentTimeMs()),
      reportHash: ethers.keccak256(ethers.toUtf8Bytes("report/unauthorized"))
    };
    const signature = await signReport(task.outsider, await addressOf(task.settlement), chainId, report);

    await expect(
      task.settlement.settle(report, signature)
    ).to.be.revertedWithCustomError(task.settlement, "UnauthorizedVerifier");

    const storedTask = await task.settlement.getTask(task.taskId);
    expect(storedTask.status).to.equal(3n);
  });

  it("rejects proof bundle replay across tasks", async function () {
    const fixture = await loadFixture(deployFixture);
    const sharedProofBundleHash = ethers.keccak256(ethers.toUtf8Bytes("bundle/replayed"));
    const firstTask = await createProofSubmittedTask({
      fixture,
      proofBundleHash: sharedProofBundleHash
    });
    const reportOne = {
      taskId: firstTask.taskId,
      buyer: firstTask.buyer.address,
      seller: firstTask.seller.address,
      commitmentHash: firstTask.commitmentHash,
      proofBundleHash: sharedProofBundleHash,
      passed: true,
      settlementAction: 1,
      settlementAmount: 1_000_000n,
      verifiedAt: BigInt(await firstTask.settlement.currentTimeMs()),
      reportHash: ethers.keccak256(ethers.toUtf8Bytes("report/one"))
    };
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const signatureOne = await signReport(
      firstTask.verifier,
      await addressOf(firstTask.settlement),
      chainId,
      reportOne
    );
    await firstTask.settlement.settle(reportOne, signatureOne);

    const secondTask = await createFundedTaskOnFixture(fixture);
    await secondTask.settlement
      .connect(secondTask.seller)
      .submitProofBundle(secondTask.taskId, sharedProofBundleHash, "ipfs://fulfillpay/proof-bundles/replay");

    const reportTwo = {
      taskId: secondTask.taskId,
      buyer: secondTask.buyer.address,
      seller: secondTask.seller.address,
      commitmentHash: secondTask.commitmentHash,
      proofBundleHash: sharedProofBundleHash,
      passed: false,
      settlementAction: 2,
      settlementAmount: 1_000_000n,
      verifiedAt: BigInt(await secondTask.settlement.currentTimeMs()),
      reportHash: ethers.keccak256(ethers.toUtf8Bytes("report/two"))
    };
    const signatureTwo = await signReport(
      secondTask.verifier,
      await addressOf(secondTask.settlement),
      chainId,
      reportTwo
    );

    await expect(
      secondTask.settlement.settle(reportTwo, signatureTwo)
    ).to.be.revertedWithCustomError(secondTask.settlement, "ProofBundleAlreadyUsed");
  });

  it("refunds after proof submission timeout expires", async function () {
    const task = await createFundedTask();

    await time.increaseTo(Number((task.deadlineMs + task.gracePeriodMs) / 1000n) + 1);

    await expect(task.settlement.refundAfterProofSubmissionDeadline(task.taskId)).to.emit(
      task.settlement,
      "TaskRefunded"
    );

    const storedTask = await task.settlement.getTask(task.taskId);
    expect(storedTask.status).to.equal(5n);
    expect(await task.mockToken.balanceOf(task.buyer.address)).to.equal(10_000_000n);
  });

  it("rejects proof submission after the grace period closes", async function () {
    const task = await createFundedTask();

    await time.increaseTo(Number((task.deadlineMs + task.gracePeriodMs) / 1000n) + 1);

    await expect(
      task.settlement
        .connect(task.seller)
        .submitProofBundle(task.taskId, ethers.keccak256(ethers.toUtf8Bytes("bundle/late")), "ipfs://late")
    ).to.be.revertedWithCustomError(task.settlement, "ProofSubmissionWindowClosed");
  });

  it("refunds after verification timeout expires", async function () {
    const task = await createProofSubmittedTask();

    const storedTask = await task.settlement.getTask(task.taskId);
    await time.increaseTo(Number((storedTask.proofSubmittedAtMs + task.verificationTimeoutMs) / 1000n) + 1);

    await expect(task.settlement.refundAfterVerificationTimeout(task.taskId)).to.emit(
      task.settlement,
      "TaskRefunded"
    );

    const updatedTask = await task.settlement.getTask(task.taskId);
    expect(updatedTask.status).to.equal(5n);
    expect(await task.mockToken.balanceOf(task.buyer.address)).to.equal(10_000_000n);
  });
});
