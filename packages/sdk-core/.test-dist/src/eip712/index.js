import { TypedDataEncoder } from "ethers";
import { hashVerificationReport } from "../hash/index.js";
import { EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION, normalizeAddress, normalizeUIntString, settlementActionToCode } from "../types/index.js";
export const VERIFICATION_REPORT_PRIMARY_TYPE = "VerificationReport";
const verificationReportFields = [
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
export const verificationReportTypes = {
    VerificationReport: verificationReportFields
};
export const verificationReportDomainName = EIP712_DOMAIN_NAME;
export const verificationReportDomainVersion = EIP712_DOMAIN_VERSION;
export function buildVerificationReportDomain(input) {
    return {
        name: EIP712_DOMAIN_NAME,
        version: EIP712_DOMAIN_VERSION,
        chainId: BigInt(normalizeUIntString(input.chainId, "chainId")),
        verifyingContract: normalizeAddress(input.settlementContract, "settlementContract")
    };
}
export function buildVerificationReportTypedDataMessage(report) {
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
export function buildVerificationReportTypedData(report) {
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
export function hashVerificationReportStruct(report) {
    return TypedDataEncoder.hashStruct(VERIFICATION_REPORT_PRIMARY_TYPE, verificationReportTypes, buildVerificationReportTypedDataMessage(report));
}
export function hashVerificationReportTypedData(report) {
    const typedData = buildVerificationReportTypedData(report);
    return TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.message);
}
function toUnsignedVerificationReport(report) {
    const { signature: _signature, ...unsignedReport } = report;
    return unsignedReport;
}
