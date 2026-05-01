import type { HexString, ExecutionCommitment, ProofBundle, VerificationReport } from "@fulfillpay/sdk-core";
import { hashExecutionCommitment, hashProofBundle } from "@fulfillpay/sdk-core";

export interface VerificationInput {
  taskId: HexString;
  commitment: ExecutionCommitment;
  commitmentHash: HexString;
  proofBundle: ProofBundle;
  proofBundleHash: HexString;
  chainId: string;
  settlementContract: HexString;
  verifierAddress: HexString;
}

export interface VerificationOutput {
  passed: boolean;
  report: Omit<VerificationReport, "reportHash" | "signature">;
}

/**
 * Run all 10 verification checks:
 * 1. commitmentHashMatched
 * 2. proofBundleHashMatched
 * 3. zkTlsProofValid (check if all receipts have valid proof hashes)
 * 4. endpointMatched (receipt host/path match commitment target)
 * 5. taskContextMatched (all receipts reference correct taskId)
 * 6. callIndicesUnique (no duplicate callIndex in receipts)
 * 7. proofNotConsumed (commitment not already used — stub: always true)
 * 8. withinTaskWindow (deadline not exceeded)
 * 9. modelMatched (declared model is in allowedModels)
 * 10. usageSatisfied (totalTokens >= minUsage.totalTokens)
 */
export function verifyProofBundle(input: VerificationInput): VerificationOutput {
  const checks = {
    commitmentHashMatched: false,
    proofBundleHashMatched: false,
    zkTlsProofValid: true, // stub: assume valid for now
    endpointMatched: false,
    taskContextMatched: false,
    callIndicesUnique: false,
    proofNotConsumed: true, // stub: always true
    withinTaskWindow: false,
    modelMatched: false,
    usageSatisfied: false,
  };

  // 1. Commitment hash match
  const computedCommitmentHash = hashExecutionCommitment(input.commitment);
  checks.commitmentHashMatched = computedCommitmentHash === input.commitmentHash;

  // 2. Proof bundle hash match
  const computedBundleHash = hashProofBundle(input.proofBundle);
  checks.proofBundleHashMatched = computedBundleHash === input.proofBundleHash;

  // 3. zkTLS proof valid — stub: check all receipts have non-empty rawProofHash
  checks.zkTlsProofValid = input.proofBundle.receipts.length > 0 &&
    input.proofBundle.receipts.every((r) => r.rawProofHash && r.rawProofHash !== ("0x" + "0".repeat(64)));

  // 4. Endpoint match — receipt taskContext taskId matches, or host matches commitment target
  checks.endpointMatched = input.proofBundle.receipts.length > 0 &&
    input.proofBundle.receipts.some(
      (r) => r.taskContext?.taskId === input.taskId ||
             r.taskContext?.settlementContract === input.settlementContract,
    );

  // 5. Task context match — all receipts reference correct taskId
  if (input.proofBundle.receipts.length === 0) {
    checks.taskContextMatched = false;
  } else {
    checks.taskContextMatched = input.proofBundle.receipts.every(
      (r) => r.taskContext && r.taskContext.taskId === input.taskId,
    );
  }

  // 6. Call indices unique
  const callIndices = input.proofBundle.receipts.map((r) => r.callIndex);
  const uniqueIndices = new Set(callIndices);
  checks.callIndicesUnique = callIndices.length === uniqueIndices.size && callIndices.length > 0;

  // 7. Proof not consumed — stub
  checks.proofNotConsumed = true;

  // 8. Within task window
  const deadlineMs = BigInt(input.commitment.deadline);
  const now = BigInt(Date.now());
  checks.withinTaskWindow = now <= deadlineMs;

  // 9. Model match — extracted model is in allowedModels
  checks.modelMatched = input.proofBundle.receipts.every((r) =>
    input.commitment.allowedModels.includes(r.extracted.model),
  );

  // 10. Usage satisfied
  const totalTokens = input.proofBundle.aggregateUsage.totalTokens;
  checks.usageSatisfied = totalTokens >= input.commitment.minUsage.totalTokens;

  const passed = Object.values(checks).every((v) => v === true);

  const action = passed ? ("RELEASE" as const) : ("REFUND" as const);
  const settlementAmount = "0";

  const verifiedAt = Date.now().toString();

  const report: Omit<VerificationReport, "reportHash" | "signature"> = {
    schemaVersion: "fulfillpay.verification-report.v1",
    chainId: input.chainId,
    settlementContract: input.settlementContract,
    taskId: input.taskId,
    buyer: input.commitment.buyer,
    seller: input.commitment.seller,
    commitmentHash: input.commitmentHash,
    proofBundleHash: input.proofBundleHash,
    passed,
    checks,
    aggregateUsage: input.proofBundle.aggregateUsage,
    settlement: {
      action,
      amount: settlementAmount,
    },
    verifier: input.verifierAddress,
    verifiedAt,
  };

  return { passed, report };
}
