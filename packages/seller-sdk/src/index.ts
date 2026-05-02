import {
  SCHEMA_VERSIONS,
  buildCallIntentHash,
  hashExecutionCommitment,
  hashObject,
  type Address,
  type Bytes32,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type ProofBundle,
  type TaskContext,
  type UnixMillis
} from "@fulfillpay/sdk-core";
import type { StorageAdapter, StoragePointer } from "@fulfillpay/storage-adapter";
import {
  MockZkTlsAdapter,
  type MockProvenFetchInput,
  type MockRawProof,
  type MockScenario,
  type ZkTlsRequestEvidence
} from "@fulfillpay/zktls-adapter";

export interface ProvenMockCallInput {
  taskContext: TaskContext;
  commitment: ExecutionCommitment;
  storage: StorageAdapter;
  callIndex?: number;
  requestBody: unknown;
  declaredModel: string;
  adapter?: MockZkTlsAdapter;
  scenario?: MockScenario;
  totalTokens?: number;
  observedAt?: string;
  providerProofId?: string;
}

export interface ProvenMockCallResult {
  callIntentHash: Bytes32;
  rawProof: MockRawProof;
  rawProofPointer: StoragePointer;
  receipt: DeliveryReceipt;
}

export interface BuildProofBundleInput {
  taskId: Bytes32;
  commitmentHash: Bytes32;
  seller: Address;
  receipts: DeliveryReceipt[];
  createdAt: UnixMillis;
}

export interface BuildAndUploadMockProofBundleInput extends ProvenMockCallInput {
  taskId?: Bytes32;
  seller?: Address;
  createdAt: UnixMillis;
}

export interface BuildAndUploadMockProofBundleResult extends ProvenMockCallResult {
  proofBundle: ProofBundle;
  proofBundlePointer: StoragePointer;
}

export async function provenFetch(input: ProvenMockCallInput): Promise<ProvenMockCallResult> {
  const adapter = input.adapter ?? new MockZkTlsAdapter();
  const callIndex = input.callIndex ?? 0;
  const request: ZkTlsRequestEvidence = {
    host: input.commitment.target.host,
    path: input.commitment.target.path,
    method: input.commitment.target.method,
    body: input.requestBody
  };
  const callIntentHash = buildCallIntentHash({
    taskContext: input.taskContext,
    callIndex,
    host: request.host,
    path: request.path,
    method: request.method,
    declaredModel: input.declaredModel,
    requestBodyHash: hashObject(input.requestBody)
  });
  const provenFetchInput: MockProvenFetchInput = {
    taskContext: input.taskContext,
    callIndex,
    callIntentHash,
    request,
    declaredModel: input.declaredModel,
    scenario: input.scenario ?? "pass",
    ...(input.totalTokens !== undefined ? { totalTokens: input.totalTokens } : {}),
    ...(input.observedAt !== undefined ? { observedAt: input.observedAt } : {}),
    ...(input.providerProofId !== undefined ? { providerProofId: input.providerProofId } : {}),
    timeWindow: {
      deadline: input.commitment.deadline
    }
  };
  const { rawProof } = await adapter.provenFetch(provenFetchInput);
  const rawProofPointer = await input.storage.putObject(rawProof, { namespace: "raw-proofs" });
  const receipt = await adapter.normalizeReceipt(rawProof, {
    taskContext: input.taskContext,
    callIndex,
    callIntentHash,
    rawProofURI: rawProofPointer.uri
  });

  return {
    callIntentHash,
    rawProof,
    rawProofPointer,
    receipt
  };
}

export function buildProofBundle(input: BuildProofBundleInput): ProofBundle {
  return {
    schemaVersion: SCHEMA_VERSIONS.proofBundle,
    taskId: input.taskId,
    commitmentHash: input.commitmentHash,
    seller: input.seller,
    receipts: input.receipts,
    aggregateUsage: {
      totalTokens: input.receipts.reduce((total, receipt) => total + receipt.extracted.usage.totalTokens, 0)
    },
    createdAt: input.createdAt
  };
}

export async function uploadProofBundle(
  storage: StorageAdapter,
  proofBundle: ProofBundle
): Promise<StoragePointer> {
  return storage.putObject(proofBundle, { namespace: "proof-bundles" });
}

export async function buildAndUploadMockProofBundle(
  input: BuildAndUploadMockProofBundleInput
): Promise<BuildAndUploadMockProofBundleResult> {
  const call = await provenFetch(input);
  const proofBundle = buildProofBundle({
    taskId: input.taskId ?? input.commitment.taskId,
    commitmentHash: hashExecutionCommitment(input.commitment),
    seller: input.seller ?? input.commitment.seller,
    receipts: [call.receipt],
    createdAt: input.createdAt
  });
  const proofBundlePointer = await uploadProofBundle(input.storage, proofBundle);

  return {
    ...call,
    proofBundle,
    proofBundlePointer
  };
}
export * from "./types.js";
export * from "./seller-agent.js";
