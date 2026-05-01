import Fastify from "fastify";
import { Wallet } from "ethers";
import type { HexString, VerificationReport, VerificationReportStruct } from "@fulfillpay/sdk-core";
import { signReport, buildDomain, hashVerificationReport } from "@fulfillpay/sdk-core";
import { verifyProofBundle, type VerificationInput } from "./verify.js";
import type { VerifierServiceConfig, VerificationResponse } from "./types.js";

/**
 * Build the Fastify service with verification routes.
 */
export async function buildService(config: VerifierServiceConfig) {
  const app = Fastify({ logger: true });

  // Derive verifier wallet from private key
  const verifierWallet = new Wallet(config.verifierPrivateKey);
  const verifierAddress = verifierWallet.address as HexString;

  // In-memory cache for verification results
  const verificationCache = new Map<HexString, { report: VerificationReport; signature: HexString }>();

  // Build EIP-712 domain
  const domain = buildDomain(BigInt(config.chainId), config.contractAddress);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: Date.now() }));

  // POST /api/verify — submit a task for verification
  app.post("/api/verify", async (request, reply) => {
    try {
      const body = request.body as { taskId: HexString; commitmentHash: HexString; proofBundleHash: HexString };
      const { taskId, commitmentHash, proofBundleHash } = body;

      if (!taskId || !commitmentHash || !proofBundleHash) {
        return reply.status(400).send({ success: false, error: "Missing required fields: taskId, commitmentHash, proofBundleHash" });
      }

      // Retrieve commitment and proof bundle from storage
      const commitmentData = await config.storage.retrieve(`commitment:${taskId}`);
      const proofBundleData = await config.storage.retrieve(`proof-bundle:${taskId}`);

      if (!commitmentData || !proofBundleData) {
        return reply.status(404).send({ success: false, error: "Commitment or proof bundle not found in storage" });
      }

      const commitment = commitmentData as any;
      const proofBundle = proofBundleData as any;

      // Run verification
      const input: VerificationInput = {
        taskId,
        commitment,
        commitmentHash,
        proofBundle,
        proofBundleHash,
        chainId: config.chainId.toString(),
        settlementContract: config.contractAddress,
        verifierAddress,
      };

      const { report: unsignedReport } = verifyProofBundle(input);

      // Build full report with reportHash (hashVerificationReport excludes reportHash and signature)
      const reportForHashing: VerificationReport = {
        ...unsignedReport,
        reportHash: "0x" + "0".repeat(64), // placeholder, will be replaced
      } as VerificationReport;

      const reportHash = hashVerificationReport(reportForHashing);
      const fullReport: VerificationReport = {
        ...unsignedReport,
        reportHash,
      } as VerificationReport;

      // Build the VerificationReportStruct for EIP-712 signing
      const reportStruct: VerificationReportStruct = {
        taskId: fullReport.taskId,
        buyer: fullReport.buyer,
        seller: fullReport.seller,
        commitmentHash: fullReport.commitmentHash,
        proofBundleHash: fullReport.proofBundleHash,
        passed: fullReport.passed,
        settlementAction: fullReport.settlement.action === "RELEASE" ? 1 : 2,
        settlementAmount: BigInt(fullReport.settlement.amount),
        verifiedAt: BigInt(fullReport.verifiedAt),
        reportHash: fullReport.reportHash!,
      };

      // Sign the report using EIP-712
      const signature = await signReport(verifierWallet, domain, reportStruct);

      const signedReport: VerificationReport = { ...fullReport, signature };

      // Store verification result
      await config.storage.store(`verification:${taskId}`, { report: signedReport, signature });
      verificationCache.set(taskId, { report: signedReport, signature });

      return { success: true, report: signedReport, signature } as VerificationResponse;
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET /api/verification/:taskId — retrieve verification result
  app.get("/api/verification/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: HexString };

    const cached = verificationCache.get(taskId);
    if (cached) {
      return { report: cached.report, signature: cached.signature };
    }

    // Try storage
    const stored = await config.storage.retrieve(`verification:${taskId}`) as { report: VerificationReport; signature: HexString } | null;
    if (stored) {
      verificationCache.set(taskId, stored);
      return { report: stored.report, signature: stored.signature };
    }

    return reply.status(404).send({ error: "Verification not found" });
  });

  // GET /api/status — service status
  app.get("/api/status", async () => ({
    service: "fulfillpay-verifier",
    version: "1.0.0",
    chainId: config.chainId,
    contractAddress: config.contractAddress,
    verifierAddress,
    verificationsCompleted: verificationCache.size,
  }));

  return app;
}
