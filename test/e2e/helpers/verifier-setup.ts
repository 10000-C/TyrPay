import { ethers } from "hardhat";
import { type Address, type Bytes32 } from "@fulfillpay/sdk-core";
import { MemoryStorageAdapter } from "@fulfillpay/storage-adapter";
import { MockZkTlsAdapter } from "@fulfillpay/zktls-adapter";
import {
  CentralizedVerifier,
  EthersSettlementTaskReader,
  InMemoryProofConsumptionRegistry,
  createVerifierHttpServer,
  toSettlementReportStruct,
  type VerificationResult,
  type SettlementReportStruct
} from "@fulfillpay/verifier-service";
import { type HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { type Server } from "node:http";

import { deployE2eFixture, type E2eEnvironment } from "./setup";

/**
 * Extended environment that includes the verifier service.
 */
export interface VerifierE2eEnvironment extends E2eEnvironment {
  verifierService: CentralizedVerifier;
  consumptionRegistry: InMemoryProofConsumptionRegistry;
  httpServer: Server;
  httpServerPort: number;
  verifierBaseUrl: string;
}

/**
 * Deploy full E2E environment with a real verifier HTTP service.
 */
export async function deployVerifierE2eFixture(): Promise<VerifierE2eEnvironment> {
  const env = await deployE2eFixture();

  const consumptionRegistry = new InMemoryProofConsumptionRegistry();
  const settlementReader = new EthersSettlementTaskReader({
    settlementAddress: env.settlementAddress,
    runner: env.verifier,
    chainId: env.chainId
  });

  const verifierService = new CentralizedVerifier({
    settlement: settlementReader,
    storage: env.storage,
    signer: env.verifier as unknown as import("@fulfillpay/verifier-service").VerificationReportSigner,
    zktlsAdapters: [env.zkTlsAdapter as unknown as import("@fulfillpay/verifier-service").RawProofVerifier],
    consumptionRegistry
  });

  const httpServer = createVerifierHttpServer({ verifier: verifierService });

  // Listen on a random available port
  const httpServerPort = await new Promise<number>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      resolve(typeof addr === "object" && addr !== null ? addr.port : 0);
    });
  });

  const verifierBaseUrl = `http://127.0.0.1:${httpServerPort}`;

  return {
    ...env,
    verifierService,
    consumptionRegistry,
    httpServer,
    httpServerPort,
    verifierBaseUrl
  };
}

/**
 * Call the verifier HTTP service to verify a task.
 */
export async function callVerifier(
  baseUrl: string,
  taskId: string,
  markProofsConsumed?: boolean
): Promise<{ status: number; body: VerificationResult | { error: string; message: string } }> {
  const response = await fetch(`${baseUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, markProofsConsumed: markProofsConsumed ?? true })
  });

  const body = await response.json();
  return { status: response.status, body: body as VerificationResult | { error: string; message: string } };
}

/**
 * Verify a task through the real verifier service and settle on-chain.
 */
export async function verifyAndSettle(input: {
  env: VerifierE2eEnvironment;
  taskId: string;
}): Promise<{ result: VerificationResult; report: VerificationResult["report"] }> {
  const { env, taskId } = input;

  // Call verifier HTTP service
  const response = await callVerifier(env.verifierBaseUrl, taskId);

  if (response.status !== 200) {
    throw new Error(`Verifier returned ${response.status}: ${JSON.stringify(response.body)}`);
  }

  const result = response.body as VerificationResult;
  const report = result.report;

  // Convert to on-chain struct and settle
  const reportStruct = toSettlementReportStruct(report);

  const signature = report.signature;
  const contract = await ethers.getContractAt("FulfillPaySettlement", env.settlementAddress);

  await (await contract.settle(reportStruct, signature)).wait();

  return { result, report };
}

/**
 * Shut down the verifier HTTP server.
 */
export async function shutdownVerifier(env: VerifierE2eEnvironment): Promise<void> {
  return new Promise((resolve, reject) => {
    env.httpServer.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}