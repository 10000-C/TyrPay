import {
  SCHEMA_VERSIONS,
  assertExecutionCommitment,
  assertProofBundle,
  assertUnsignedVerificationReport,
  assertVerificationReport,
  buildVerificationReportTypedData,
  hashDeliveryReceipt,
  hashExecutionCommitment,
  hashObject,
  hashProofBundle,
  hashVerificationReport,
  normalizeAddress,
  normalizeBytes32,
  normalizeUIntString,
  settlementActionToCode,
  type Address,
  type AggregateUsage,
  type Bytes32,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type ProofBundle,
  type TaskContext,
  type TaskStatus,
  type UIntLike,
  type UIntString,
  type URI,
  type UnixMillis,
  type UnsignedVerificationReport,
  type VerificationReport
} from "@fulfillpay/sdk-core";
import type { StorageAdapter } from "@fulfillpay/storage-adapter";
import type { ProviderProofContext, ZkTlsRequestEvidence } from "@fulfillpay/zktls-adapter";

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
] as const;

export type VerificationCheckName = (typeof REQUIRED_VERIFICATION_CHECKS)[number];
export type RequiredVerificationChecks = Record<VerificationCheckName, boolean>;

const TASK_STATUS_BY_INDEX: TaskStatus[] = [
  "INTENT_CREATED",
  "COMMITMENT_SUBMITTED",
  "FUNDED",
  "PROOF_SUBMITTED",
  "SETTLED",
  "REFUNDED"
];

export interface OnChainTask {
  taskId: Bytes32;
  taskNonce: Bytes32;
  buyer: Address;
  seller: Address;
  token: Address;
  amount: UIntString;
  deadline: UnixMillis;
  commitmentHash: Bytes32;
  commitmentURI: URI;
  fundedAt: UnixMillis;
  proofBundleHash: Bytes32;
  proofBundleURI: URI;
  proofSubmittedAt: UnixMillis;
  status: TaskStatus;
}

export type ChainTaskLike = OnChainTask | Record<string, unknown>;

export interface SettlementTaskReader {
  getTask(taskId: Bytes32): Promise<ChainTaskLike>;
  getChainId(): Promise<UIntLike>;
  getSettlementContractAddress(): Promise<string>;
  isProofBundleConsumed?(proofBundleHash: Bytes32): Promise<boolean>;
}

export interface RawProofVerifier {
  readonly name: string;
  verifyRawProof(rawProof: unknown): Promise<boolean>;
}

export interface VerificationReportSigner {
  getAddress(): Promise<string> | string;
  signTypedData(
    domain: ReturnType<typeof buildVerificationReportTypedData>["domain"],
    types: ReturnType<typeof buildVerificationReportTypedData>["types"],
    message: ReturnType<typeof buildVerificationReportTypedData>["message"]
  ): Promise<string>;
}

export interface ProofConsumptionKeys {
  providerProofIds: string[];
  receiptHashes: Bytes32[];
  responseHashes: Bytes32[];
  callIntentHashes: Bytes32[];
}

export interface ProofConsumptionRecord {
  taskId: Bytes32;
  proofBundleHash: Bytes32;
  reportHash: Bytes32;
  passed: boolean;
  verifiedAt: UnixMillis;
}

export interface ProofConsumptionRegistry {
  hasAny(keys: ProofConsumptionKeys): Promise<boolean>;
  markConsumed(keys: ProofConsumptionKeys, record: ProofConsumptionRecord): Promise<void>;
}

export interface CentralizedVerifierOptions {
  settlement: SettlementTaskReader;
  storage: StorageAdapter;
  signer: VerificationReportSigner;
  zktlsAdapters: RawProofVerifier[];
  consumptionRegistry?: ProofConsumptionRegistry;
  verifierAddress?: string;
  clock?: () => UIntLike | Promise<UIntLike>;
}

export interface VerifyTaskOptions {
  markProofsConsumed?: boolean;
}

export interface VerificationInputs {
  chainId: UIntString;
  settlementContract: Address;
  task: OnChainTask;
  commitment: ExecutionCommitment;
  proofBundle: ProofBundle;
  rawProofs: unknown[];
}

export interface VerificationEvaluation {
  checks: RequiredVerificationChecks;
  aggregateUsage: AggregateUsage;
  consumptionKeys: ProofConsumptionKeys;
}

export interface VerificationResult {
  report: VerificationReport;
  checks: RequiredVerificationChecks;
  aggregateUsage: AggregateUsage;
  consumed: boolean;
}

export interface SettlementReportStruct {
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

export class VerifierInputUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifierInputUnavailableError";
  }
}

export class VerifierInvalidTaskStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifierInvalidTaskStateError";
  }
}

export class InMemoryProofConsumptionRegistry implements ProofConsumptionRegistry {
  private readonly providerProofIds = new Set<string>();
  private readonly receiptHashes = new Set<Bytes32>();
  private readonly responseHashes = new Set<Bytes32>();
  private readonly callIntentHashes = new Set<Bytes32>();

  async hasAny(keys: ProofConsumptionKeys): Promise<boolean> {
    return (
      keys.providerProofIds.some((key) => this.providerProofIds.has(key)) ||
      keys.receiptHashes.some((key) => this.receiptHashes.has(key)) ||
      keys.responseHashes.some((key) => this.responseHashes.has(key)) ||
      keys.callIntentHashes.some((key) => this.callIntentHashes.has(key))
    );
  }

  async markConsumed(keys: ProofConsumptionKeys): Promise<void> {
    keys.providerProofIds.forEach((key) => this.providerProofIds.add(key));
    keys.receiptHashes.forEach((key) => this.receiptHashes.add(key));
    keys.responseHashes.forEach((key) => this.responseHashes.add(key));
    keys.callIntentHashes.forEach((key) => this.callIntentHashes.add(key));
  }
}

export class CentralizedVerifier {
  private readonly zktlsAdapters: Map<string, RawProofVerifier>;
  private readonly consumptionRegistry: ProofConsumptionRegistry;
  private readonly clock: () => UIntLike | Promise<UIntLike>;

  constructor(private readonly options: CentralizedVerifierOptions) {
    if (options.zktlsAdapters.length === 0) {
      throw new TypeError("CentralizedVerifier requires at least one zkTLS adapter.");
    }

    this.zktlsAdapters = new Map(options.zktlsAdapters.map((adapter) => [adapter.name, adapter]));
    this.consumptionRegistry = options.consumptionRegistry ?? new InMemoryProofConsumptionRegistry();
    this.clock = options.clock ?? (() => Date.now());
  }

  async verifyTask(taskIdInput: string, options: VerifyTaskOptions = {}): Promise<VerificationResult> {
    const taskId = normalizeBytes32(taskIdInput, "taskId");
    const inputs = await this.loadInputs(taskId);
    const evaluation = await this.evaluate(inputs);
    const unsignedReport = await this.buildUnsignedReport(inputs, evaluation);
    const report = await signVerificationReport(unsignedReport, this.options.signer);

    let consumed = false;
    if (options.markProofsConsumed ?? true) {
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

  async loadInputs(taskId: Bytes32): Promise<VerificationInputs> {
    const [chainId, settlementContract, taskLike] = await Promise.all([
      this.options.settlement.getChainId(),
      this.options.settlement.getSettlementContractAddress(),
      this.options.settlement.getTask(taskId)
    ]);
    const task = normalizeChainTask(taskLike);

    if (task.status !== "PROOF_SUBMITTED") {
      throw new VerifierInvalidTaskStateError(`Task ${task.taskId} must be PROOF_SUBMITTED before verification.`);
    }

    const [commitment, proofBundle] = await Promise.all([
      this.loadStoredObject<ExecutionCommitment>(task.commitmentURI, task.commitmentHash, "execution commitment"),
      this.loadStoredObject<ProofBundle>(task.proofBundleURI, task.proofBundleHash, "proof bundle")
    ]);

    assertExecutionCommitment(commitment);
    assertProofBundle(proofBundle);

    const rawProofs = await Promise.all(
      proofBundle.receipts.map((receipt) =>
        this.loadStoredObject<unknown>(receipt.rawProofURI, receipt.rawProofHash, `raw proof ${receipt.providerProofId}`)
      )
    );

    return {
      chainId: normalizeUIntString(chainId, "chainId"),
      settlementContract: normalizeAddress(settlementContract, "settlementContract"),
      task,
      commitment,
      proofBundle,
      rawProofs
    };
  }

  async evaluate(inputs: VerificationInputs): Promise<VerificationEvaluation> {
    const { task, commitment, proofBundle, rawProofs } = inputs;
    const consumptionKeys = buildProofConsumptionKeys(proofBundle);
    const aggregateUsage = aggregateReceiptUsage(proofBundle.receipts);
    const proofBundleAlreadyConsumed = await this.options.settlement.isProofBundleConsumed?.(task.proofBundleHash);
    const expectedTaskContext = buildExpectedTaskContext(inputs);

    const checks: RequiredVerificationChecks = {
      commitmentHashMatched: hashExecutionCommitment(commitment) === task.commitmentHash,
      proofBundleHashMatched: hashProofBundle(proofBundle) === task.proofBundleHash,
      zkTlsProofValid: await this.areZkTlsProofsValid(proofBundle.receipts, rawProofs),
      endpointMatched: proofBundle.receipts.every((receipt, index) =>
        isEndpointMatched(commitment, rawProofs[index], receipt)
      ),
      taskContextMatched:
        isCommitmentBoundToTask(commitment, task) &&
        isProofBundleBoundToTask(proofBundle, task) &&
        proofBundle.receipts.every((receipt, index) =>
          isReceiptBoundToExpectedContext(receipt, rawProofs[index], expectedTaskContext)
        ),
      callIndicesUnique: hasUniqueValues(proofBundle.receipts.map((receipt) => receipt.callIndex)),
      proofNotConsumed:
        !(await this.consumptionRegistry.hasAny(consumptionKeys)) &&
        !hasDuplicateConsumptionKey(consumptionKeys) &&
        proofBundleAlreadyConsumed !== true,
      withinTaskWindow: proofBundle.receipts.every((receipt) => isWithinTaskWindow(receipt, task, commitment)),
      modelMatched: proofBundle.receipts.every((receipt) => commitment.allowedModels.includes(receipt.extracted.model)),
      usageSatisfied: aggregateUsage.totalTokens >= commitment.minUsage.totalTokens
    };

    return {
      checks,
      aggregateUsage,
      consumptionKeys
    };
  }

  private async buildUnsignedReport(
    inputs: VerificationInputs,
    evaluation: VerificationEvaluation
  ): Promise<UnsignedVerificationReport> {
    const passed = REQUIRED_VERIFICATION_CHECKS.every((check) => evaluation.checks[check]);
    const settlementAction = passed ? "RELEASE" : "REFUND";
    const verifier = await this.getVerifierAddress();
    const verifiedAt = normalizeUIntString(await this.clock(), "verifiedAt") as UnixMillis;
    const report: UnsignedVerificationReport = {
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

  private async areZkTlsProofsValid(receipts: DeliveryReceipt[], rawProofs: unknown[]): Promise<boolean> {
    const results = await Promise.all(
      receipts.map(async (receipt, index) => {
        const adapter = this.zktlsAdapters.get(receipt.provider);

        if (!adapter) {
          return false;
        }

        try {
          return (
            hashObject(rawProofs[index]) === receipt.rawProofHash &&
            extractProviderProofId(rawProofs[index]) === receipt.providerProofId &&
            (await adapter.verifyRawProof(rawProofs[index]))
          );
        } catch {
          return false;
        }
      })
    );

    return results.every(Boolean);
  }

  private async getVerifierAddress(): Promise<Address> {
    if (this.options.verifierAddress !== undefined) {
      return normalizeAddress(this.options.verifierAddress, "verifierAddress");
    }

    return normalizeAddress(await this.options.signer.getAddress(), "verifier");
  }

  private async loadStoredObject<T>(uri: URI, expectedHash: Bytes32, label: string): Promise<T> {
    try {
      return await this.options.storage.getObject<T>(uri);
    } catch (error) {
      if (isExpectedHashRequiredError(error)) {
        return this.options.storage.getObject<T>(uri, { expectedHash });
      }

      throw new VerifierInputUnavailableError(`Unable to load ${label} from ${uri}: ${toErrorMessage(error)}`);
    }
  }
}

export function createVerifierService(options: CentralizedVerifierOptions): CentralizedVerifier {
  return new CentralizedVerifier(options);
}

export async function signVerificationReport(
  report: UnsignedVerificationReport,
  signer: VerificationReportSigner
): Promise<VerificationReport> {
  const reportWithHash: UnsignedVerificationReport = {
    ...report,
    reportHash: hashVerificationReport(report)
  };
  const typedData = buildVerificationReportTypedData(reportWithHash);
  const signature = await signer.signTypedData(typedData.domain, typedData.types, typedData.message);
  const signedReport: VerificationReport = {
    ...reportWithHash,
    signature
  };

  assertVerificationReport(signedReport);
  return signedReport;
}

export function toSettlementReportStruct(
  report: UnsignedVerificationReport | VerificationReport
): SettlementReportStruct {
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

export function normalizeChainTask(input: ChainTaskLike): OnChainTask {
  const object = assertRecord(input, "task");

  return {
    taskId: normalizeBytes32(readRequiredField(object, "taskId"), "task.taskId"),
    taskNonce: normalizeBytes32(readRequiredField(object, "taskNonce"), "task.taskNonce"),
    buyer: normalizeAddress(readRequiredField(object, "buyer"), "task.buyer"),
    seller: normalizeAddress(readRequiredField(object, "seller"), "task.seller"),
    token: normalizeAddress(readRequiredField(object, "token"), "task.token"),
    amount: normalizeUIntString(readRequiredUIntLike(object, "amount"), "task.amount"),
    deadline: normalizeUIntString(readRequiredUIntLike(object, "deadlineMs", "deadline"), "task.deadline") as UnixMillis,
    commitmentHash: normalizeBytes32(readRequiredField(object, "commitmentHash"), "task.commitmentHash"),
    commitmentURI: readRequiredField(object, "commitmentURI", "commitmentUri"),
    fundedAt: normalizeUIntString(readRequiredUIntLike(object, "fundedAtMs", "fundedAt"), "task.fundedAt") as UnixMillis,
    proofBundleHash: normalizeBytes32(readRequiredField(object, "proofBundleHash"), "task.proofBundleHash"),
    proofBundleURI: readRequiredField(object, "proofBundleURI", "proofBundleUri"),
    proofSubmittedAt: normalizeUIntString(
      readRequiredUIntLike(object, "proofSubmittedAtMs", "proofSubmittedAt"),
      "task.proofSubmittedAt"
    ) as UnixMillis,
    status: normalizeTaskStatus(readRequiredUnknownField(object, "status"))
  };
}

export function normalizeTaskStatus(value: unknown): TaskStatus {
  if (typeof value === "string") {
    if ((TASK_STATUS_BY_INDEX as string[]).includes(value)) {
      return value as TaskStatus;
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

export function buildProofConsumptionKeys(proofBundle: ProofBundle): ProofConsumptionKeys {
  assertProofBundle(proofBundle);

  return {
    providerProofIds: proofBundle.receipts.map((receipt) => receipt.providerProofId),
    receiptHashes: proofBundle.receipts.map((receipt) => hashDeliveryReceipt(receipt)),
    responseHashes: proofBundle.receipts.map((receipt) => receipt.responseHash),
    callIntentHashes: proofBundle.receipts.map((receipt) => receipt.callIntentHash)
  };
}

function buildExpectedTaskContext(inputs: VerificationInputs): TaskContext {
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

function aggregateReceiptUsage(receipts: DeliveryReceipt[]): AggregateUsage {
  return {
    totalTokens: receipts.reduce((total, receipt) => total + receipt.extracted.usage.totalTokens, 0)
  };
}

function isCommitmentBoundToTask(commitment: ExecutionCommitment, task: OnChainTask): boolean {
  return (
    commitment.taskId === task.taskId &&
    commitment.buyer === task.buyer &&
    commitment.seller === task.seller &&
    BigInt(commitment.deadline) <= BigInt(task.deadline)
  );
}

function isProofBundleBoundToTask(proofBundle: ProofBundle, task: OnChainTask): boolean {
  return (
    proofBundle.taskId === task.taskId &&
    proofBundle.commitmentHash === task.commitmentHash &&
    proofBundle.seller === task.seller
  );
}

function isReceiptBoundToExpectedContext(
  receipt: DeliveryReceipt,
  rawProof: unknown,
  expectedTaskContext: TaskContext
): boolean {
  return (
    taskContextsEqual(receipt.taskContext, expectedTaskContext) &&
    providerProofContextMatchesReceipt(extractProviderProofContext(rawProof), receipt, expectedTaskContext)
  );
}

function providerProofContextMatchesReceipt(
  proofContext: ProviderProofContext | null,
  receipt: DeliveryReceipt,
  expectedTaskContext: TaskContext
): boolean {
  if (!proofContext) {
    return false;
  }

  return (
    proofContext.protocol === expectedTaskContext.protocol &&
    proofContext.version === expectedTaskContext.version &&
    proofContext.chainId === expectedTaskContext.chainId &&
    proofContext.settlementContract === expectedTaskContext.settlementContract &&
    proofContext.taskId === expectedTaskContext.taskId &&
    proofContext.taskNonce === expectedTaskContext.taskNonce &&
    proofContext.commitmentHash === expectedTaskContext.commitmentHash &&
    proofContext.buyer === expectedTaskContext.buyer &&
    proofContext.seller === expectedTaskContext.seller &&
    proofContext.callIndex === receipt.callIndex &&
    proofContext.callIntentHash === receipt.callIntentHash
  );
}

function taskContextsEqual(left: TaskContext, right: TaskContext): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.protocol === right.protocol &&
    left.version === right.version &&
    left.chainId === right.chainId &&
    left.settlementContract === right.settlementContract &&
    left.taskId === right.taskId &&
    left.taskNonce === right.taskNonce &&
    left.commitmentHash === right.commitmentHash &&
    left.buyer === right.buyer &&
    left.seller === right.seller
  );
}

function isEndpointMatched(commitment: ExecutionCommitment, rawProof: unknown, receipt: DeliveryReceipt): boolean {
  const request = extractRequestEvidence(rawProof);

  return (
    request !== null &&
    receipt.provider.length > 0 &&
    request.host === commitment.target.host &&
    request.path === commitment.target.path &&
    request.method.toUpperCase() === commitment.target.method
  );
}

function isWithinTaskWindow(receipt: DeliveryReceipt, task: OnChainTask, commitment: ExecutionCommitment): boolean {
  const observedAt = BigInt(receipt.observedAt);
  const fundedAt = BigInt(task.fundedAt);
  const deadline = minBigInt(BigInt(task.deadline), BigInt(commitment.deadline));

  return observedAt >= fundedAt && observedAt <= deadline;
}

function hasDuplicateConsumptionKey(keys: ProofConsumptionKeys): boolean {
  return (
    !hasUniqueValues(keys.providerProofIds) ||
    !hasUniqueValues(keys.receiptHashes) ||
    !hasUniqueValues(keys.responseHashes) ||
    !hasUniqueValues(keys.callIntentHashes)
  );
}

function hasUniqueValues<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

function extractProviderProofContext(rawProof: unknown): ProviderProofContext | null {
  if (!isRecord(rawProof) || !isRecord(rawProof.proofContext)) {
    return null;
  }

  const context = rawProof.proofContext;

  if (
    typeof context.protocol !== "string" ||
    typeof context.version !== "number" ||
    typeof context.chainId !== "string" ||
    typeof context.settlementContract !== "string" ||
    typeof context.taskId !== "string" ||
    typeof context.taskNonce !== "string" ||
    typeof context.commitmentHash !== "string" ||
    typeof context.buyer !== "string" ||
    typeof context.seller !== "string" ||
    typeof context.callIndex !== "number" ||
    typeof context.callIntentHash !== "string"
  ) {
    return null;
  }

  return context as unknown as ProviderProofContext;
}

function extractRequestEvidence(rawProof: unknown): Pick<ZkTlsRequestEvidence, "host" | "path" | "method"> | null {
  if (!isRecord(rawProof) || !isRecord(rawProof.request)) {
    return null;
  }

  const request = rawProof.request;
  if (typeof request.host !== "string" || typeof request.path !== "string" || typeof request.method !== "string") {
    return null;
  }

  return {
    host: request.host,
    path: request.path,
    method: request.method
  };
}

function extractProviderProofId(rawProof: unknown): string | null {
  if (!isRecord(rawProof) || typeof rawProof.providerProofId !== "string") {
    return null;
  }

  return rawProof.providerProofId;
}

function readRequiredField(object: Record<string, unknown>, ...fieldNames: string[]): string {
  const value = readRequiredUnknownField(object, ...fieldNames);

  if (typeof value !== "string") {
    throw new TypeError(`${fieldNames.join(" or ")} must be a string.`);
  }

  return value;
}

function readRequiredUIntLike(object: Record<string, unknown>, ...fieldNames: string[]): UIntLike {
  const value = readRequiredUnknownField(object, ...fieldNames);

  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new TypeError(`${fieldNames.join(" or ")} must be a uint-like value.`);
  }

  return value;
}

function readRequiredUnknownField(object: Record<string, unknown>, ...fieldNames: string[]): unknown {
  for (const fieldName of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(object, fieldName)) {
      return object[fieldName];
    }
  }

  throw new TypeError(`${fieldNames.join(" or ")} is required.`);
}

function statusFromIndex(index: number): TaskStatus {
  const status = TASK_STATUS_BY_INDEX[index];

  if (!status) {
    throw new TypeError(`Unsupported task status index: ${index}.`);
  }

  return status;
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function assertRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${fieldName} must be a plain object.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isExpectedHashRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("expectedHash is required");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
