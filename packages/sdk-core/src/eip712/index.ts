import { TypedDataEncoder } from "ethers";

import { hashVerificationReport } from "../hash/index.js";
import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  normalizeAddress,
  normalizeUIntString,
  settlementActionToCode,
  type Address,
  type Bytes32,
  type UIntLike,
  type UnsignedVerificationReport,
  type VerificationReport
} from "../types/index.js";

export const VERIFICATION_REPORT_PRIMARY_TYPE = "VerificationReport" as const;

const verificationReportFields: Array<{ name: string; type: string }> = [
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
];

export const verificationReportTypes: Record<typeof VERIFICATION_REPORT_PRIMARY_TYPE, Array<{ name: string; type: string }>> = {
  VerificationReport: verificationReportFields
};

export interface VerificationReportEip712Domain {
  name: typeof EIP712_DOMAIN_NAME;
  version: typeof EIP712_DOMAIN_VERSION;
  chainId: bigint;
  verifyingContract: Address;
}

export interface VerificationReportTypedDataMessage {
  taskId: Bytes32;
  buyer: Address;
  seller: Address;
  commitmentHash: Bytes32;
  proofBundleHash: Bytes32;
  passed: boolean;
  settlementAction: number;
  settlementAmount: bigint;
  verifiedAt: bigint;
  reportHash: Bytes32;
}

export interface BuildVerificationReportDomainInput {
  chainId: UIntLike;
  settlementContract: string;
}

export interface VerificationReportTypedData {
  domain: VerificationReportEip712Domain;
  types: typeof verificationReportTypes;
  primaryType: typeof VERIFICATION_REPORT_PRIMARY_TYPE;
  message: VerificationReportTypedDataMessage;
}

export const verificationReportDomainName = EIP712_DOMAIN_NAME;
export const verificationReportDomainVersion = EIP712_DOMAIN_VERSION;

export function buildVerificationReportDomain(input: BuildVerificationReportDomainInput): VerificationReportEip712Domain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: BigInt(normalizeUIntString(input.chainId, "chainId")),
    verifyingContract: normalizeAddress(input.settlementContract, "settlementContract")
  };
}

export function buildVerificationReportTypedDataMessage(
  report: UnsignedVerificationReport | VerificationReport
): VerificationReportTypedDataMessage {
  const unsignedReport = toUnsignedVerificationReport(report);
  const computedReportHash = hashVerificationReport(unsignedReport);

  if (report.reportHash !== undefined && report.reportHash !== computedReportHash) {
    throw new TypeError("VerificationReport.reportHash does not match the canonical unsigned report hash.");
  }

  return {
    taskId: report.taskId,
    buyer: report.buyer,
    seller: report.seller,
    commitmentHash: report.commitmentHash,
    proofBundleHash: report.proofBundleHash,
    passed: report.passed,
    settlementAction: settlementActionToCode(report.settlement.action),
    settlementAmount: BigInt(report.settlement.amount),
    verifiedAt: BigInt(report.verifiedAt),
    reportHash: computedReportHash
  };
}

export function buildVerificationReportTypedData(
  report: UnsignedVerificationReport | VerificationReport
): VerificationReportTypedData {
  return {
    domain: buildVerificationReportDomain({
      chainId: report.chainId,
      settlementContract: report.settlementContract
    }),
    types: verificationReportTypes,
    primaryType: VERIFICATION_REPORT_PRIMARY_TYPE,
    message: buildVerificationReportTypedDataMessage(report)
  };
}

export function hashVerificationReportStruct(report: UnsignedVerificationReport | VerificationReport): Bytes32 {
  return TypedDataEncoder.hashStruct(
    VERIFICATION_REPORT_PRIMARY_TYPE,
    verificationReportTypes,
    buildVerificationReportTypedDataMessage(report)
  ) as Bytes32;
}

export function hashVerificationReportTypedData(report: UnsignedVerificationReport | VerificationReport): Bytes32 {
  const typedData = buildVerificationReportTypedData(report);

  return TypedDataEncoder.hash(
    typedData.domain,
    typedData.types,
    typedData.message
  ) as Bytes32;
}

function toUnsignedVerificationReport(report: UnsignedVerificationReport | VerificationReport): UnsignedVerificationReport {
  const { signature: _signature, ...unsignedReport } = report;
  return unsignedReport;
}
