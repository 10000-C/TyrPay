import { Contract } from "ethers";
import type { Signer } from "ethers";
import type {
  HexString,
  VerificationReport,
  VerificationReportStruct,
} from "@fulfillpay/sdk-core";
import { SettlementAction, hashVerificationReport } from "@fulfillpay/sdk-core";
import type {
  VerifierClientConfig,
  SettleParams,
  SettleResult,
  VerifyAndSettleResult,
} from "./types.js";
import { CONTRACT_ABI } from "./abi.js";

/**
 * Convert an off-chain VerificationReport to the on-chain struct representation.
 *
 * Maps string-based fields to their numeric / BigInt equivalents expected by
 * the contract's VerificationReport struct.
 */
function reportToStruct(report: VerificationReport): VerificationReportStruct {
  const action =
    report.settlement.action === "RELEASE"
      ? SettlementAction.RELEASE
      : SettlementAction.REFUND;

  return {
    taskId: report.taskId,
    buyer: report.buyer,
    seller: report.seller,
    commitmentHash: report.commitmentHash,
    proofBundleHash: report.proofBundleHash,
    passed: report.passed,
    settlementAction: action,
    settlementAmount: BigInt(report.settlement.amount),
    verifiedAt: BigInt(report.verifiedAt),
    reportHash: report.reportHash ?? hashVerificationReport(report),
  };
}

/**
 * VerifierClient — interacts with the FulFilPay settlement contract and
 * the verifier service to verify and settle tasks.
 *
 * Typical usage:
 * ```ts
 * const client = new VerifierClient({
 *   contractAddress: "0x...",
 *   signer: wallet,
 *   verifierServiceUrl: "https://verifier.example.com",
 *   chainId: 1,
 * });
 * const result = await client.verifyAndSettle(taskId);
 * ```
 */
export class VerifierClient {
  private config: VerifierClientConfig;
  private contract: Contract;

  constructor(config: VerifierClientConfig) {
    this.config = config;
    this.contract = new Contract(
      config.contractAddress,
      CONTRACT_ABI,
      config.signer as Signer,
    );
  }

  /**
   * Submit a pre-built settlement transaction to the contract.
   *
   * @param params - The report struct and EIP-712 signature
   * @returns The taskId and transaction hash
   */
  async settle(params: SettleParams): Promise<SettleResult> {
    const tx = await this.contract.settle(
      {
        taskId: params.report.taskId,
        buyer: params.report.buyer,
        seller: params.report.seller,
        commitmentHash: params.report.commitmentHash,
        proofBundleHash: params.report.proofBundleHash,
        passed: params.report.passed,
        settlementAction: params.report.settlementAction,
        settlementAmount: params.report.settlementAmount,
        verifiedAt: params.report.verifiedAt,
        reportHash: params.report.reportHash,
      },
      params.signature,
    );
    const receipt = await tx.wait();
    return { taskId: params.report.taskId, txHash: receipt.hash as HexString };
  }

  /**
   * Fetch a verification report from the verifier service and settle on-chain
   * in a single call.
   *
   * @param taskId - The bytes32 task identifier
   * @returns The taskId, transaction hash, and the full off-chain report
   */
  async verifyAndSettle(taskId: HexString): Promise<VerifyAndSettleResult> {
    // GET verification report from verifier service
    const url = `${this.config.verifierServiceUrl}/api/verification/${taskId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch verification report: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      report: VerificationReport;
      signature: HexString;
    };
    const report = data.report;
    const signature = data.signature;

    // Convert to struct and settle
    const reportStruct = reportToStruct(report);
    const result = await this.settle({ report: reportStruct, signature });

    return { ...result, report };
  }
}
