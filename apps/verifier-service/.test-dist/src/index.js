import { createServer } from "node:http";
import { SCHEMA_VERSIONS, assertExecutionCommitment, assertProofBundle, assertUnsignedVerificationReport, assertVerificationReport, buildCallIntentHash, buildVerificationReportTypedData, hashDeliveryReceipt, hashExecutionCommitment, hashObject, hashProofBundle, hashVerificationReport, normalizeAddress, normalizeBytes32, normalizeUIntString, settlementActionToCode } from "@fulfillpay/sdk-core";
import { StorageIntegrityError } from "@fulfillpay/storage-adapter";
import { hashRequestEvidence, hashResponseEvidence } from "@fulfillpay/zktls-adapter";
import { Contract } from "ethers";
export const REQUIRED_VERIFICATION_CHECKS = [
    "commitmentHashMatched",
    "proofBundleHashMatched",
    "zkTlsProofValid",
    "endpointMatched",
    "taskContextMatched",
    "callIndicesUnique",
    "proofNotConsumed",
    "withinTaskWindow",
    "modelMatched",
    "usageSatisfied"
];
const TASK_STATUS_BY_INDEX = [
    "INTENT_CREATED",
    "COMMITMENT_SUBMITTED",
    "FUNDED",
    "PROOF_SUBMITTED",
    "SETTLED",
    "REFUNDED"
];
export class VerifierInputUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = "VerifierInputUnavailableError";
    }
}
export class VerifierInputIntegrityError extends Error {
    constructor(message) {
        super(message);
        this.name = "VerifierInputIntegrityError";
    }
}
export class VerifierInvalidTaskStateError extends Error {
    constructor(message) {
        super(message);
        this.name = "VerifierInvalidTaskStateError";
    }
}
export class VerifierUnauthorizedError extends Error {
    constructor(message) {
        super(message);
        this.name = "VerifierUnauthorizedError";
    }
}
export class ProofAlreadyConsumedError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProofAlreadyConsumedError";
    }
}
const SETTLEMENT_READER_ABI = [
    "function getTask(bytes32 taskId) view returns ((bytes32 taskId, bytes32 taskNonce, address buyer, address seller, address token, uint256 amount, uint256 deadlineMs, bytes32 commitmentHash, string commitmentURI, uint256 fundedAtMs, bytes32 proofBundleHash, string proofBundleURI, uint256 proofSubmittedAtMs, bytes32 reportHash, uint256 settledAtMs, uint256 refundedAtMs, uint8 status))",
    "function usedProofBundleHash(bytes32 proofBundleHash) view returns (bool)",
    "function verifierRegistry() view returns (address)",
    "function proofSubmissionGracePeriodMs() view returns (uint256)",
    "function verificationTimeoutMs() view returns (uint256)"
];
const VERIFIER_REGISTRY_READER_ABI = ["function isVerifier(address verifier) view returns (bool)"];
export class EthersSettlementTaskReader {
    options;
    settlement;
    constructor(options) {
        this.options = options;
        this.settlement = new Contract(options.settlementAddress, SETTLEMENT_READER_ABI, options.runner);
    }
    async getTask(taskId) {
        const task = await this.settlement.getTask(taskId);
        return normalizeChainTask({
            taskId: task.taskId,
            taskNonce: task.taskNonce,
            buyer: task.buyer,
            seller: task.seller,
            token: task.token,
            amount: task.amount,
            deadlineMs: task.deadlineMs,
            commitmentHash: task.commitmentHash,
            commitmentURI: task.commitmentURI,
            fundedAtMs: task.fundedAtMs,
            proofBundleHash: task.proofBundleHash,
            proofBundleURI: task.proofBundleURI,
            proofSubmittedAtMs: task.proofSubmittedAtMs,
            status: task.status
        });
    }
    async getChainId() {
        if (this.options.chainId !== undefined) {
            return normalizeUIntString(this.options.chainId, "chainId");
        }
        const provider = this.options.runner.provider;
        if (!provider) {
            throw new TypeError("EthersSettlementTaskReader requires options.chainId when runner.provider is unavailable.");
        }
        const network = await provider.getNetwork();
        return normalizeUIntString(network.chainId, "chainId");
    }
    async getSettlementContractAddress() {
        return normalizeAddress(await this.settlement.getAddress(), "settlementContract");
    }
    async isProofBundleConsumed(proofBundleHash) {
        return Boolean(await this.settlement.usedProofBundleHash(proofBundleHash));
    }
    async isVerifierAuthorized(verifier) {
        const registryAddress = this.options.verifierRegistryAddress ?? normalizeAddress(await this.settlement.verifierRegistry(), "verifierRegistry");
        const registry = new Contract(registryAddress, VERIFIER_REGISTRY_READER_ABI, this.options.runner);
        return Boolean(await registry.isVerifier(verifier));
    }
    async getProofSubmissionGracePeriod() {
        return normalizeUIntString(await this.settlement.proofSubmissionGracePeriodMs(), "proofSubmissionGracePeriodMs");
    }
    async getVerificationTimeout() {
        return normalizeUIntString(await this.settlement.verificationTimeoutMs(), "verificationTimeoutMs");
    }
}
export class InMemoryProofConsumptionRegistry {
    recordsByKey = new Map();
    async findAny(keys) {
        for (const entry of flattenProofConsumptionKeys(keys)) {
            const record = this.recordsByKey.get(toProofConsumptionKey(entry));
            if (record) {
                return record;
            }
        }
        return null;
    }
    async hasAny(keys) {
        return (await this.findAny(keys)) !== null;
    }
    async markConsumed(keys, record) {
        if (hasDuplicateConsumptionKey(keys) || (await this.hasAny(keys))) {
            throw new ProofAlreadyConsumedError("One or more proof consumption keys were already consumed.");
        }
        flattenProofConsumptionKeys(keys).forEach((entry) => this.recordsByKey.set(toProofConsumptionKey(entry), record));
    }
}
export class PrismaProofConsumptionRegistry {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAny(keys) {
        const entries = flattenProofConsumptionKeys(keys);
        if (entries.length === 0) {
            return null;
        }
        const existing = await this.prisma.proofConsumptionKey.findFirst({
            where: {
                OR: entries
            },
            select: {
                taskId: true,
                proofBundleHash: true,
                reportHash: true,
                passed: true,
                verifiedAt: true
            }
        });
        if (!existing) {
            return null;
        }
        return {
            taskId: normalizeBytes32(existing.taskId, "proofConsumptionKey.taskId"),
            proofBundleHash: normalizeBytes32(existing.proofBundleHash, "proofConsumptionKey.proofBundleHash"),
            reportHash: normalizeBytes32(existing.reportHash, "proofConsumptionKey.reportHash"),
            passed: existing.passed,
            verifiedAt: normalizeUIntString(existing.verifiedAt, "proofConsumptionKey.verifiedAt")
        };
    }
    async hasAny(keys) {
        return (await this.findAny(keys)) !== null;
    }
    async markConsumed(keys, record) {
        if (hasDuplicateConsumptionKey(keys)) {
            throw new ProofAlreadyConsumedError("Proof bundle contains duplicate proof consumption keys.");
        }
        // The hasAny pre-check is a fast path for the common case.
        // The DB unique constraint in createMany below is the true serialization point
        // and handles concurrent verifier instances racing to consume the same keys.
        if (await this.hasAny(keys)) {
            throw new ProofAlreadyConsumedError("One or more proof consumption keys were already consumed.");
        }
        const data = flattenProofConsumptionKeys(keys).map((entry) => ({
            ...entry,
            taskId: record.taskId,
            proofBundleHash: record.proofBundleHash,
            reportHash: record.reportHash,
            passed: record.passed,
            verifiedAt: record.verifiedAt
        }));
        try {
            await this.prisma.proofConsumptionKey.createMany({ data });
        }
        catch (error) {
            throw new ProofAlreadyConsumedError(`Unable to reserve proof consumption keys: ${toErrorMessage(error)}`);
        }
    }
}
export class CentralizedVerifier {
    options;
    zktlsAdapters;
    consumptionRegistry;
    clock;
    constructor(options) {
        this.options = options;
        if (options.zktlsAdapters.length === 0) {
            throw new TypeError("CentralizedVerifier requires at least one zkTLS adapter.");
        }
        if (!options.consumptionRegistry) {
            throw new TypeError("CentralizedVerifier requires an explicit proof consumption registry.");
        }
        this.zktlsAdapters = new Map(options.zktlsAdapters.map((adapter) => [adapter.name, adapter]));
        this.consumptionRegistry = options.consumptionRegistry;
        this.clock = options.clock ?? (() => Date.now());
    }
    async verifyTask(taskIdInput, options = {}) {
        const taskId = normalizeBytes32(taskIdInput, "taskId");
        const inputs = await this.loadInputs(taskId);
        const verifier = await this.getVerifierAddress();
        const verifiedAt = normalizeUIntString(await this.clock(), "verifiedAt");
        await this.assertVerifierCanSign(inputs, verifier, verifiedAt);
        const evaluation = await this.evaluate(inputs);
        if (evaluation.existingConsumptionRecord !== null) {
            throw new ProofAlreadyConsumedError(`One or more proof consumption keys for task ${inputs.task.taskId} and bundle ${inputs.task.proofBundleHash} were already reserved by task ${evaluation.existingConsumptionRecord.taskId}, bundle ${evaluation.existingConsumptionRecord.proofBundleHash}, report ${evaluation.existingConsumptionRecord.reportHash}.`);
        }
        if (evaluation.proofBundleAlreadyConsumed) {
            throw new ProofAlreadyConsumedError(`Proof bundle ${inputs.task.proofBundleHash} was already consumed by the settlement contract.`);
        }
        const unsignedReport = this.buildUnsignedReport(inputs, evaluation, verifier, verifiedAt);
        const report = await signVerificationReport(unsignedReport, this.options.signer);
        let consumed = false;
        if ((options.markProofsConsumed ?? true) && evaluation.checks.proofNotConsumed && evaluation.proofsEligibleForConsumption) {
            const reportHash = report.reportHash ?? hashVerificationReport(report);
            await this.consumptionRegistry.markConsumed(evaluation.consumptionKeys, {
                taskId: inputs.task.taskId,
                proofBundleHash: inputs.task.proofBundleHash,
                reportHash,
                passed: report.passed,
                verifiedAt: report.verifiedAt
            });
            consumed = true;
        }
        return {
            report,
            checks: evaluation.checks,
            aggregateUsage: evaluation.aggregateUsage,
            consumed
        };
    }
    async loadInputs(taskId) {
        const [chainId, settlementContract, proofSubmissionGracePeriod, verificationTimeout, task] = await Promise.all([
            this.options.settlement.getChainId(),
            this.options.settlement.getSettlementContractAddress(),
            this.options.settlement.getProofSubmissionGracePeriod(),
            this.options.settlement.getVerificationTimeout(),
            this.options.settlement.getTask(taskId)
        ]);
        if (task.status !== "PROOF_SUBMITTED") {
            throw new VerifierInvalidTaskStateError(`Task ${task.taskId} must be PROOF_SUBMITTED before verification.`);
        }
        const normalizedProofSubmissionGracePeriod = normalizeUIntString(proofSubmissionGracePeriod, "proofSubmissionGracePeriod");
        const normalizedVerificationTimeout = normalizeUIntString(verificationTimeout, "verificationTimeout");
        const proofSubmissionClosesAt = BigInt(task.deadline) + BigInt(normalizedProofSubmissionGracePeriod);
        if (BigInt(task.proofSubmittedAt) > proofSubmissionClosesAt) {
            throw new VerifierInvalidTaskStateError(`Task ${task.taskId} proof submission is outside the configured grace period.`);
        }
        const [commitment, proofBundle] = await Promise.all([
            this.loadStoredObject(task.commitmentURI, task.commitmentHash, "execution commitment"),
            this.loadStoredObject(task.proofBundleURI, task.proofBundleHash, "proof bundle")
        ]);
        assertExecutionCommitment(commitment);
        assertProofBundle(proofBundle);
        const rawProofs = await Promise.all(proofBundle.receipts.map((receipt) => this.loadStoredObject(receipt.rawProofURI, receipt.rawProofHash, `raw proof ${receipt.providerProofId}`)));
        return {
            chainId: normalizeUIntString(chainId, "chainId"),
            settlementContract: normalizeAddress(settlementContract, "settlementContract"),
            proofSubmissionGracePeriod: normalizedProofSubmissionGracePeriod,
            verificationTimeout: normalizedVerificationTimeout,
            task,
            commitment,
            proofBundle,
            rawProofs
        };
    }
    async evaluate(inputs) {
        const { task, commitment, proofBundle, rawProofs } = inputs;
        const consumptionKeys = buildProofConsumptionKeys(proofBundle);
        const [receiptProofs, existingConsumptionRecord, proofBundleAlreadyConsumed] = await Promise.all([
            this.verifyReceiptProofs(proofBundle.receipts, rawProofs),
            this.consumptionRegistry.findAny(consumptionKeys),
            this.options.settlement.isProofBundleConsumed(task.proofBundleHash)
        ]);
        const expectedTaskContext = buildExpectedTaskContext(inputs);
        const receiptAcceptedForUsage = proofBundle.receipts.map((receipt, index) => isReceiptAcceptedForUsage(receipt, rawProofs[index], receiptProofs[index], expectedTaskContext, task, commitment));
        const aggregateUsage = aggregateAcceptedUsage(receiptProofs, receiptAcceptedForUsage);
        const checks = {
            commitmentHashMatched: hashExecutionCommitment(commitment) === task.commitmentHash,
            proofBundleHashMatched: hashProofBundle(proofBundle) === task.proofBundleHash,
            zkTlsProofValid: receiptProofs.every((proof) => proof.receiptMatchesVerifiedRawProof),
            endpointMatched: receiptProofs.every((proof) => hasAcceptedReceiptEvidence(proof) && isEndpointMatched(commitment, proof.evidence)),
            taskContextMatched: isCommitmentBoundToTask(commitment, task) &&
                isProofBundleBoundToTask(proofBundle, task) &&
                proofBundle.receipts.every((receipt, index) => isReceiptBoundToExpectedContext(receipt, rawProofs[index], expectedTaskContext, receiptProofs[index])),
            callIndicesUnique: hasUniqueValues(proofBundle.receipts.map((receipt) => receipt.callIndex)) &&
                !hasDuplicateConsumptionKey(consumptionKeys),
            proofNotConsumed: existingConsumptionRecord === null &&
                proofBundleAlreadyConsumed !== true,
            withinTaskWindow: receiptProofs.every((proof) => hasAcceptedReceiptEvidence(proof) && isWithinTaskWindow(proof.evidence.observedAt, task, commitment)),
            modelMatched: receiptProofs.every((proof) => hasAcceptedReceiptEvidence(proof) && commitment.allowedModels.includes(proof.evidence.extracted.model)),
            usageSatisfied: aggregateUsage.totalTokens >= commitment.minUsage.totalTokens
        };
        return {
            checks,
            aggregateUsage,
            consumptionKeys,
            existingConsumptionRecord,
            proofBundleAlreadyConsumed,
            proofsEligibleForConsumption: checks.zkTlsProofValid && checks.taskContextMatched && checks.callIndicesUnique
        };
    }
    buildUnsignedReport(inputs, evaluation, verifier, verifiedAt) {
        const passed = REQUIRED_VERIFICATION_CHECKS.every((check) => evaluation.checks[check]);
        const settlementAction = passed ? "RELEASE" : "REFUND";
        const report = {
            schemaVersion: SCHEMA_VERSIONS.verificationReport,
            chainId: inputs.chainId,
            settlementContract: inputs.settlementContract,
            taskId: inputs.task.taskId,
            buyer: inputs.task.buyer,
            seller: inputs.task.seller,
            commitmentHash: inputs.task.commitmentHash,
            proofBundleHash: inputs.task.proofBundleHash,
            passed,
            checks: evaluation.checks,
            aggregateUsage: evaluation.aggregateUsage,
            settlement: {
                action: settlementAction,
                amount: inputs.task.amount
            },
            verifier,
            verifiedAt
        };
        assertUnsignedVerificationReport(report);
        return report;
    }
    async verifyReceiptProofs(receipts, rawProofs) {
        return Promise.all(receipts.map(async (receipt, index) => {
            const adapter = this.zktlsAdapters.get(receipt.provider);
            if (!adapter) {
                return {
                    receiptMatchesVerifiedRawProof: false,
                    evidence: null
                };
            }
            try {
                const rawProofHashMatched = hashObject(rawProofs[index]) === receipt.rawProofHash;
                const rawProofVerified = rawProofHashMatched && (await adapter.verifyRawProof(rawProofs[index]));
                const evidence = rawProofVerified ? await extractReceiptEvidence(adapter, rawProofs[index]) : null;
                return {
                    receiptMatchesVerifiedRawProof: evidenceMatchesReceipt(evidence, receipt),
                    evidence
                };
            }
            catch (error) {
                throw new VerifierInputUnavailableError(`zkTLS proof verification for provider ${receipt.provider} is temporarily unavailable: ${toErrorMessage(error)}`);
            }
        }));
    }
    async getVerifierAddress() {
        if (this.options.verifierAddress !== undefined) {
            return normalizeAddress(this.options.verifierAddress, "verifierAddress");
        }
        return normalizeAddress(await this.options.signer.getAddress(), "verifier");
    }
    async assertVerifierCanSign(inputs, verifier, verifiedAt) {
        if (inputs.commitment.verifier !== verifier) {
            throw new VerifierUnauthorizedError(`Verifier ${verifier} is not the verifier assigned by the commitment (${inputs.commitment.verifier}).`);
        }
        if (!(await this.options.settlement.isVerifierAuthorized(verifier))) {
            throw new VerifierUnauthorizedError(`Verifier ${verifier} is not authorized by the verifier registry.`);
        }
        const expiresAt = BigInt(inputs.task.proofSubmittedAt) + BigInt(inputs.verificationTimeout);
        if (BigInt(verifiedAt) > expiresAt) {
            throw new VerifierInvalidTaskStateError(`Task ${inputs.task.taskId} verification timeout expired before report generation.`);
        }
    }
    async loadStoredObject(uri, expectedHash, label) {
        try {
            return await this.options.storage.getObject(uri, { expectedHash });
        }
        catch (error) {
            if (isExpectedHashRequiredError(error)) {
                return this.options.storage.getObject(uri, { expectedHash });
            }
            if (error instanceof StorageIntegrityError) {
                throw new VerifierInputIntegrityError(`Stored ${label} at ${uri} failed integrity verification: ${error.message}`);
            }
            throw new VerifierInputUnavailableError(`Unable to load ${label} from ${uri}: ${toErrorMessage(error)}`);
        }
    }
}
export function createVerifierService(options) {
    return new CentralizedVerifier(options);
}
export function createVerifierHttpServer(options) {
    const pathPrefix = normalizeHttpPathPrefix(options.pathPrefix ?? "");
    return createServer(async (request, response) => {
        try {
            const url = new URL(request.url ?? "/", "http://localhost");
            const pathname = stripPathPrefix(url.pathname, pathPrefix);
            if (request.method === "GET" && pathname === "/health") {
                writeJson(response, 200, { status: "ok" });
                return;
            }
            if (request.method === "POST" && pathname === "/verify") {
                const body = await readJsonBody(request);
                if (!body || typeof body.taskId !== "string") {
                    writeJson(response, 400, { error: "VerifierBadRequest", message: "POST /verify requires string taskId." });
                    return;
                }
                const result = await options.verifier.verifyTask(body.taskId, {
                    markProofsConsumed: body.markProofsConsumed
                });
                writeJson(response, 200, result);
                return;
            }
            writeJson(response, 404, { error: "VerifierRouteNotFound", message: `No route for ${request.method} ${url.pathname}.` });
        }
        catch (error) {
            writeJson(response, statusForHttpError(error), {
                error: error instanceof Error ? error.name : "VerifierError",
                message: toErrorMessage(error)
            });
        }
    });
}
export async function signVerificationReport(report, signer) {
    assertUnsignedVerificationReport(report);
    assertRequiredVerificationChecksAndPassRule(report);
    const signerAddress = normalizeAddress(await signer.getAddress(), "signer");
    if (report.verifier !== signerAddress) {
        throw new VerifierUnauthorizedError(`VerificationReport.verifier ${report.verifier} does not match signer ${signerAddress}.`);
    }
    const reportWithHash = {
        ...report,
        reportHash: hashVerificationReport(report)
    };
    const typedData = buildVerificationReportTypedData(reportWithHash);
    const signature = await signer.signTypedData(typedData.domain, typedData.types, typedData.message);
    const signedReport = {
        ...reportWithHash,
        signature
    };
    assertVerificationReport(signedReport);
    return signedReport;
}
function assertRequiredVerificationChecksAndPassRule(report) {
    for (const check of REQUIRED_VERIFICATION_CHECKS) {
        if (typeof report.checks[check] !== "boolean") {
            throw new TypeError(`VerificationReport.checks.${check} is required.`);
        }
    }
    const expectedPassed = REQUIRED_VERIFICATION_CHECKS.every((check) => report.checks[check]);
    if (report.passed !== expectedPassed) {
        throw new TypeError("VerificationReport.passed must equal the AND of all required verification checks.");
    }
}
export function toSettlementReportStruct(report) {
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
        reportHash: report.reportHash ?? hashVerificationReport(report)
    };
}
export function normalizeChainTask(input) {
    const object = assertRecord(input, "task");
    return {
        taskId: normalizeBytes32(readRequiredField(object, "taskId"), "task.taskId"),
        taskNonce: normalizeBytes32(readRequiredField(object, "taskNonce"), "task.taskNonce"),
        buyer: normalizeAddress(readRequiredField(object, "buyer"), "task.buyer"),
        seller: normalizeAddress(readRequiredField(object, "seller"), "task.seller"),
        token: normalizeAddress(readRequiredField(object, "token"), "task.token"),
        amount: normalizeUIntString(readRequiredUIntLike(object, "amount"), "task.amount"),
        deadline: normalizeUIntString(readRequiredUIntLike(object, "deadlineMs", "deadline"), "task.deadline"),
        commitmentHash: normalizeBytes32(readRequiredField(object, "commitmentHash"), "task.commitmentHash"),
        commitmentURI: readRequiredField(object, "commitmentURI", "commitmentUri"),
        fundedAt: normalizeUIntString(readRequiredUIntLike(object, "fundedAtMs", "fundedAt"), "task.fundedAt"),
        proofBundleHash: normalizeBytes32(readRequiredField(object, "proofBundleHash"), "task.proofBundleHash"),
        proofBundleURI: readRequiredField(object, "proofBundleURI", "proofBundleUri"),
        proofSubmittedAt: normalizeUIntString(readRequiredUIntLike(object, "proofSubmittedAtMs", "proofSubmittedAt"), "task.proofSubmittedAt"),
        status: normalizeTaskStatus(readRequiredUnknownField(object, "status"))
    };
}
export function normalizeTaskStatus(value) {
    if (typeof value === "string") {
        if (TASK_STATUS_BY_INDEX.includes(value)) {
            return value;
        }
        if (/^(0|[1-9][0-9]*)$/.test(value)) {
            return statusFromIndex(Number(value));
        }
    }
    if (typeof value === "number" && Number.isSafeInteger(value)) {
        return statusFromIndex(value);
    }
    if (typeof value === "bigint") {
        return statusFromIndex(Number(value));
    }
    throw new TypeError(`Unsupported task status: ${String(value)}.`);
}
export function buildProofConsumptionKeys(proofBundle) {
    assertProofBundle(proofBundle);
    return {
        providerProofIds: proofBundle.receipts.map((receipt) => receipt.providerProofId),
        receiptHashes: proofBundle.receipts.map((receipt) => hashDeliveryReceipt(receipt)),
        responseHashes: proofBundle.receipts.map((receipt) => receipt.responseHash),
        callIntentHashes: proofBundle.receipts.map((receipt) => receipt.callIntentHash)
    };
}
function hasAcceptedReceiptEvidence(proof) {
    return proof.receiptMatchesVerifiedRawProof && proof.evidence !== null;
}
function evidenceMatchesReceipt(evidence, receipt) {
    if (!evidence) {
        return false;
    }
    try {
        return (evidence.provider === receipt.provider &&
            evidence.providerProofId === receipt.providerProofId &&
            hashRequestEvidence(evidence.request) === receipt.requestHash &&
            hashResponseEvidence(evidence.response) === receipt.responseHash &&
            evidence.observedAt === receipt.observedAt &&
            extractedFieldsEqual(evidence.extracted, receipt.extracted));
    }
    catch {
        return false;
    }
}
async function extractReceiptEvidence(adapter, rawProof) {
    if (adapter.extractReceiptEvidence) {
        return adapter.extractReceiptEvidence(rawProof);
    }
    return extractCommonRawProofReceiptEvidence(rawProof);
}
function extractCommonRawProofReceiptEvidence(rawProof) {
    if (!isRecord(rawProof)) {
        return null;
    }
    const request = extractRequestEvidence(rawProof);
    const response = extractResponseEvidence(rawProof);
    const observedAt = extractObservedAt(rawProof);
    const extracted = extractExtractedReceiptFields(rawProof);
    if (typeof rawProof.provider !== "string" ||
        typeof rawProof.providerProofId !== "string" ||
        !request ||
        !response ||
        !observedAt ||
        !extracted) {
        return null;
    }
    return {
        provider: rawProof.provider,
        providerProofId: rawProof.providerProofId,
        request,
        response,
        observedAt,
        extracted
    };
}
function extractedFieldsEqual(left, right) {
    return left.model === right.model && left.usage.totalTokens === right.usage.totalTokens;
}
function flattenProofConsumptionKeys(keys) {
    const entries = [
        ...keys.providerProofIds.map((key) => ({ keyType: "providerProofId", key })),
        ...keys.receiptHashes.map((key) => ({ keyType: "receiptHash", key })),
        ...keys.responseHashes.map((key) => ({ keyType: "responseHash", key })),
        ...keys.callIntentHashes.map((key) => ({ keyType: "callIntentHash", key }))
    ];
    const seen = new Set();
    return entries.filter((entry) => {
        const composite = `${entry.keyType}:${entry.key}`;
        if (seen.has(composite)) {
            return false;
        }
        seen.add(composite);
        return true;
    });
}
function toProofConsumptionKey(entry) {
    return `${entry.keyType}:${entry.key}`;
}
function buildExpectedTaskContext(inputs) {
    return {
        schemaVersion: SCHEMA_VERSIONS.taskContext,
        protocol: "FulfillPay",
        version: 1,
        chainId: inputs.chainId,
        settlementContract: inputs.settlementContract,
        taskId: inputs.task.taskId,
        taskNonce: inputs.task.taskNonce,
        commitmentHash: inputs.task.commitmentHash,
        buyer: inputs.task.buyer,
        seller: inputs.task.seller
    };
}
function aggregateAcceptedUsage(receiptProofs, acceptedReceipts) {
    return {
        totalTokens: receiptProofs.reduce((total, proof, index) => {
            if (!acceptedReceipts[index] || !hasAcceptedReceiptEvidence(proof)) {
                return total;
            }
            return total + proof.evidence.extracted.usage.totalTokens;
        }, 0)
    };
}
function isCommitmentBoundToTask(commitment, task) {
    return (commitment.taskId === task.taskId &&
        commitment.buyer === task.buyer &&
        commitment.seller === task.seller &&
        BigInt(commitment.deadline) <= BigInt(task.deadline));
}
function isProofBundleBoundToTask(proofBundle, task) {
    return (proofBundle.taskId === task.taskId &&
        proofBundle.commitmentHash === task.commitmentHash &&
        proofBundle.seller === task.seller);
}
function isReceiptBoundToExpectedContext(receipt, rawProof, expectedTaskContext, proof) {
    return (taskContextsEqual(receipt.taskContext, expectedTaskContext) &&
        providerProofContextMatchesReceipt(extractProviderProofContext(rawProof), receipt, expectedTaskContext) &&
        hasAcceptedReceiptEvidence(proof) &&
        receiptCallIntentMatchesEvidence(receipt, proof.evidence, expectedTaskContext));
}
function providerProofContextMatchesReceipt(proofContext, receipt, expectedTaskContext) {
    if (!proofContext) {
        return false;
    }
    return (proofContext.protocol === expectedTaskContext.protocol &&
        proofContext.version === expectedTaskContext.version &&
        proofContext.chainId === expectedTaskContext.chainId &&
        proofContext.settlementContract === expectedTaskContext.settlementContract &&
        proofContext.taskId === expectedTaskContext.taskId &&
        proofContext.taskNonce === expectedTaskContext.taskNonce &&
        proofContext.commitmentHash === expectedTaskContext.commitmentHash &&
        proofContext.buyer === expectedTaskContext.buyer &&
        proofContext.seller === expectedTaskContext.seller &&
        proofContext.callIndex === receipt.callIndex &&
        proofContext.callIntentHash === receipt.callIntentHash);
}
function isReceiptAcceptedForUsage(receipt, rawProof, proof, expectedTaskContext, task, commitment) {
    return (hasAcceptedReceiptEvidence(proof) &&
        isEndpointMatched(commitment, proof.evidence) &&
        isReceiptBoundToExpectedContext(receipt, rawProof, expectedTaskContext, proof) &&
        isWithinTaskWindow(proof.evidence.observedAt, task, commitment) &&
        commitment.allowedModels.includes(proof.evidence.extracted.model));
}
function receiptCallIntentMatchesEvidence(receipt, evidence, expectedTaskContext) {
    const declaredModel = extractDeclaredModel(evidence.request.body);
    if (!declaredModel) {
        return false;
    }
    try {
        const expectedCallIntentHash = buildCallIntentHash({
            taskContext: expectedTaskContext,
            callIndex: receipt.callIndex,
            host: evidence.request.host,
            path: evidence.request.path,
            method: evidence.request.method,
            declaredModel,
            requestBodyHash: hashObject(evidence.request.body)
        });
        return receipt.callIntentHash === expectedCallIntentHash;
    }
    catch {
        return false;
    }
}
function extractDeclaredModel(requestBody) {
    if (!isRecord(requestBody) || typeof requestBody.model !== "string" || requestBody.model.length === 0) {
        return null;
    }
    return requestBody.model;
}
function taskContextsEqual(left, right) {
    return (left.schemaVersion === right.schemaVersion &&
        left.protocol === right.protocol &&
        left.version === right.version &&
        left.chainId === right.chainId &&
        left.settlementContract === right.settlementContract &&
        left.taskId === right.taskId &&
        left.taskNonce === right.taskNonce &&
        left.commitmentHash === right.commitmentHash &&
        left.buyer === right.buyer &&
        left.seller === right.seller);
}
function isEndpointMatched(commitment, evidence) {
    if (!evidence) {
        return false;
    }
    const request = evidence.request;
    return (evidence.provider.length > 0 &&
        request.host === commitment.target.host &&
        request.path === commitment.target.path &&
        request.method.toUpperCase() === commitment.target.method);
}
function isWithinTaskWindow(observedAtInput, task, commitment) {
    const observedAt = BigInt(observedAtInput);
    const fundedAt = BigInt(task.fundedAt);
    const deadline = minBigInt(BigInt(task.deadline), BigInt(commitment.deadline));
    return observedAt >= fundedAt && observedAt <= deadline;
}
function hasDuplicateConsumptionKey(keys) {
    return (!hasUniqueValues(keys.providerProofIds) ||
        !hasUniqueValues(keys.receiptHashes) ||
        !hasUniqueValues(keys.responseHashes) ||
        !hasUniqueValues(keys.callIntentHashes));
}
function hasUniqueValues(values) {
    return new Set(values).size === values.length;
}
function extractProviderProofContext(rawProof) {
    if (!isRecord(rawProof) || !isRecord(rawProof.proofContext)) {
        return null;
    }
    const context = rawProof.proofContext;
    if (typeof context.protocol !== "string" ||
        typeof context.version !== "number" ||
        typeof context.chainId !== "string" ||
        typeof context.settlementContract !== "string" ||
        typeof context.taskId !== "string" ||
        typeof context.taskNonce !== "string" ||
        typeof context.commitmentHash !== "string" ||
        typeof context.buyer !== "string" ||
        typeof context.seller !== "string" ||
        typeof context.callIndex !== "number" ||
        typeof context.callIntentHash !== "string") {
        return null;
    }
    return context;
}
function extractRequestEvidence(rawProof) {
    if (!isRecord(rawProof) || !isRecord(rawProof.request)) {
        return null;
    }
    const request = rawProof.request;
    if (typeof request.host !== "string" || typeof request.path !== "string" || typeof request.method !== "string") {
        return null;
    }
    const headers = request.headers === undefined ? undefined : extractStringRecord(request.headers);
    if (request.headers !== undefined && !headers) {
        return null;
    }
    return {
        host: request.host,
        path: request.path,
        method: request.method,
        ...(headers ? { headers } : {}),
        ...(Object.prototype.hasOwnProperty.call(request, "body") ? { body: request.body } : {})
    };
}
function extractResponseEvidence(rawProof) {
    if (!isRecord(rawProof) || !isRecord(rawProof.response)) {
        return null;
    }
    const response = rawProof.response;
    if (typeof response.status !== "number" ||
        !Number.isSafeInteger(response.status) ||
        response.status < 100 ||
        response.status > 599 ||
        !Object.prototype.hasOwnProperty.call(response, "body")) {
        return null;
    }
    const headers = response.headers === undefined ? undefined : extractStringRecord(response.headers);
    if (response.headers !== undefined && !headers) {
        return null;
    }
    return {
        status: response.status,
        ...(headers ? { headers } : {}),
        body: response.body
    };
}
function extractObservedAt(rawProof) {
    if (!isRecord(rawProof) || (typeof rawProof.observedAt !== "string" && typeof rawProof.observedAt !== "number")) {
        return null;
    }
    try {
        return normalizeUIntString(rawProof.observedAt, "rawProof.observedAt");
    }
    catch {
        return null;
    }
}
function extractExtractedReceiptFields(rawProof) {
    if (!isRecord(rawProof) || !isRecord(rawProof.extracted)) {
        return null;
    }
    const extracted = rawProof.extracted;
    if (!isRecord(extracted.usage)) {
        return null;
    }
    const usage = extracted.usage;
    if (typeof extracted.model !== "string" ||
        extracted.model.length === 0 ||
        typeof usage.totalTokens !== "number" ||
        !Number.isSafeInteger(usage.totalTokens) ||
        usage.totalTokens < 0) {
        return null;
    }
    return {
        model: extracted.model,
        usage: {
            totalTokens: usage.totalTokens
        }
    };
}
function extractStringRecord(value) {
    if (!isRecord(value)) {
        return null;
    }
    const entries = Object.entries(value);
    if (entries.some(([key, nestedValue]) => !key || typeof nestedValue !== "string" || nestedValue.length === 0)) {
        return null;
    }
    return Object.fromEntries(entries);
}
function readRequiredField(object, ...fieldNames) {
    const value = readRequiredUnknownField(object, ...fieldNames);
    if (typeof value !== "string") {
        throw new TypeError(`${fieldNames.join(" or ")} must be a string.`);
    }
    return value;
}
function readRequiredUIntLike(object, ...fieldNames) {
    const value = readRequiredUnknownField(object, ...fieldNames);
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
        throw new TypeError(`${fieldNames.join(" or ")} must be a uint-like value.`);
    }
    return value;
}
function readRequiredUnknownField(object, ...fieldNames) {
    for (const fieldName of fieldNames) {
        if (Object.prototype.hasOwnProperty.call(object, fieldName)) {
            return object[fieldName];
        }
    }
    throw new TypeError(`${fieldNames.join(" or ")} is required.`);
}
function statusFromIndex(index) {
    const status = TASK_STATUS_BY_INDEX[index];
    if (!status) {
        throw new TypeError(`Unsupported task status index: ${index}.`);
    }
    return status;
}
function minBigInt(left, right) {
    return left < right ? left : right;
}
function assertRecord(value, fieldName) {
    if (!isRecord(value)) {
        throw new TypeError(`${fieldName} must be a plain object.`);
    }
    return value;
}
function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function isExpectedHashRequiredError(error) {
    return error instanceof Error && error.message.includes("expectedHash is required");
}
function normalizeHttpPathPrefix(pathPrefix) {
    const trimmed = pathPrefix.trim();
    if (!trimmed || trimmed === "/") {
        return "";
    }
    return trimmed.startsWith("/") ? trimmed.replace(/\/+$/, "") : `/${trimmed.replace(/\/+$/, "")}`;
}
function stripPathPrefix(pathname, pathPrefix) {
    if (!pathPrefix) {
        return pathname;
    }
    if (pathname === pathPrefix) {
        return "/";
    }
    return pathname.startsWith(`${pathPrefix}/`) ? pathname.slice(pathPrefix.length) : pathname;
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) {
        return undefined;
    }
    return JSON.parse(text);
}
function writeJson(response, statusCode, payload) {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}
function statusForHttpError(error) {
    if (error instanceof ProofAlreadyConsumedError) {
        return 409;
    }
    if (error instanceof VerifierUnauthorizedError) {
        return 403;
    }
    if (error instanceof VerifierInputUnavailableError) {
        return 503;
    }
    if (error instanceof VerifierInputIntegrityError ||
        error instanceof VerifierInvalidTaskStateError ||
        error instanceof TypeError) {
        return 400;
    }
    return 500;
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
