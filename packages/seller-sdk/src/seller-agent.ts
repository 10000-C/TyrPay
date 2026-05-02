import { keccak256, toUtf8Bytes } from "ethers";

import {
  SCHEMA_VERSIONS,
  assertExecutionCommitment,
  assertProofBundle,
  buildTaskContext,
  hashExecutionCommitment,
  hashObject,
  hashProofBundle,
  normalizeAddress,
  normalizeBytes32,
  normalizeUIntString,
  type Address,
  type Bytes32,
  type DeliveryReceipt,
  type ExecutionCommitment,
  type ProofBundle,
  type TaskContext,
  type UIntLike,
  type URI,
  type UnixMillis
} from "@fulfillpay/sdk-core";
import type { StoragePointer, StorageAdapter } from "@fulfillpay/storage-adapter";
import type { ZkTlsAdapter, ZkTlsReceiptContext, ProvenFetchResult } from "@fulfillpay/zktls-adapter";

import type {
  SellerConfig,
  Signer,
  ContractLike,
  SubmitCommitmentResult,
  SubmitProofBundleHashResult,
  UploadProofBundleResult
} from "./types.js";

/**
 * Input for provenFetch.
 */
export interface ProvenFetchInput {
  /** The execution commitment (needed for task context derivation) */
  commitment: ExecutionCommitment;
  /** Call index for this particular fetch */
  callIndex: number;
  /** The request evidence to send */
  request: Parameters<ZkTlsAdapter["provenFetch"]>[0] extends { request: infer R } ? R : never;
  /** The declared model for this call */
  declaredModel: string;
  /** Task nonce (from on-chain task) */
  taskNonce: Bytes32;
}

/**
 * Result of provenFetch including the raw proof and extracted fields.
 */
export interface ProvenFetchOutput {
  /** The delivery receipt constructed from the proven fetch */
  receipt: DeliveryReceipt;
  /** The raw proof from the zkTLS adapter */
  rawProof: unknown;
}

/**
 * Input for buildProofBundle.
 */
export interface BuildProofBundleInput {
  /** The execution commitment */
  commitment: ExecutionCommitment;
  /** Delivery receipts from proven fetches */
  receipts: DeliveryReceipt[];
  /** Optional override for createdAt timestamp (defaults to now) */
  createdAt?: UIntLike;
}

/**
 * SellerAgent — the main class driving the Seller side of the FulfillPay protocol.
 *
 * Provides methods for:
 * - Submitting execution commitments on-chain
 * - Performing zkTLS-backed proven fetches
 * - Building delivery receipts
 * - Assembling proof bundles
 * - Uploading proof bundles to storage
 * - Submitting proof bundle hashes on-chain
 */
export class SellerAgent {
  readonly signer: Signer;
  readonly settlementContract: Address;
  readonly chainId: string;
  readonly storageAdapter: StorageAdapter;
  readonly zkTlsAdapter: ZkTlsAdapter;

  constructor(config: SellerConfig) {
    this.signer = config.signer;
    this.settlementContract = normalizeAddress(config.settlementContract, "settlementContract");
    this.chainId = normalizeUIntString(config.chainId, "chainId");
    this.storageAdapter = config.storageAdapter;
    this.zkTlsAdapter = config.zkTlsAdapter;
  }

  /**
   * Build a TaskContext from an ExecutionCommitment and task nonce.
   * This is a utility used internally and can also be used externally.
   */
  buildTaskContextFromCommitment(commitment: ExecutionCommitment, taskNonce: Bytes32): TaskContext {
    assertExecutionCommitment(commitment);

    return buildTaskContext({
      chainId: this.chainId,
      settlementContract: this.settlementContract,
      taskId: commitment.taskId,
      taskNonce,
      commitmentHash: hashExecutionCommitment(commitment),
      buyer: commitment.buyer,
      seller: commitment.seller
    });
  }

  /**
   * Submit an execution commitment on-chain.
   *
   * This calls `submitCommitment(taskId, commitmentHash, commitmentURI)` on the
   * FulfillPaySettlement contract, transitioning the task from INTENT_CREATED to
   * COMMITMENT_SUBMITTED.
   *
   * @param contract - The settlement contract instance (ethers Contract)
   * @param commitment - The fully constructed ExecutionCommitment
   * @param commitmentURI - URI where the commitment data can be retrieved
   * @returns The submission result including tx hash
   */
  async submitCommitment(
    contract: ContractLike,
    commitment: ExecutionCommitment,
    commitmentURI: URI
  ): Promise<SubmitCommitmentResult> {
    assertExecutionCommitment(commitment);

    if (!commitmentURI || commitmentURI.length === 0) {
      throw new TypeError("commitmentURI must be a non-empty string.");
    }

    const commitmentHash = hashExecutionCommitment(commitment);
    const taskId = commitment.taskId;

    const tx = await contract.submitCommitment(taskId, commitmentHash, commitmentURI);
    await tx.wait();

    return {
      txHash: tx.hash,
      taskId,
      commitmentHash,
      commitmentURI
    };
  }

  /**
   * Perform a zkTLS-backed proven fetch against the API endpoint declared in the commitment.
   *
   * The method:
   * 1. Builds the TaskContext from the commitment
   * 2. Computes the callIntentHash
   * 3. Calls the zkTLS adapter's provenFetch
   * 4. Normalizes the result into a DeliveryReceipt
   *
   * @param input - The proven fetch input parameters
   * @returns The delivery receipt and raw proof
   */
  async provenFetch(input: ProvenFetchInput): Promise<ProvenFetchOutput> {
    assertExecutionCommitment(input.commitment);

    const taskContext = this.buildTaskContextFromCommitment(input.commitment, normalizeBytes32(input.taskNonce, "taskNonce"));
    const callIntentHash = computeCallIntentHash(taskContext, input.callIndex, input.request, input.declaredModel);

    // Call the zkTLS adapter's provenFetch
    const provenFetchInput = {
      taskContext,
      callIndex: input.callIndex,
      callIntentHash,
      request: input.request,
      declaredModel: input.declaredModel
    };

    const result = await this.zkTlsAdapter.provenFetch(provenFetchInput as never);

    // Upload the raw proof to storage first to get a URI
    const rawProofPointer = await this.storageAdapter.putObject(result.rawProof, {
      namespace: "raw-proofs"
    });

    // Build the receipt context for normalization
    const receiptContext: ZkTlsReceiptContext = {
      taskContext,
      callIndex: input.callIndex,
      callIntentHash,
      rawProofURI: rawProofPointer.uri
    };

    // Normalize the raw proof into a DeliveryReceipt
    const receipt = await this.zkTlsAdapter.normalizeReceipt(result.rawProof, receiptContext);

    return {
      receipt,
      rawProof: result.rawProof
    };
  }

  /**
   * Build a DeliveryReceipt from a proven fetch result.
   * This is a convenience wrapper around provenFetch that returns just the receipt.
   *
   * @param input - The proven fetch input parameters
   * @returns The constructed DeliveryReceipt
   */
  async buildDeliveryReceipt(input: ProvenFetchInput): Promise<DeliveryReceipt> {
    const { receipt } = await this.provenFetch(input);
    return receipt;
  }

  /**
   * Build a ProofBundle from delivery receipts.
   *
   * The ProofBundle aggregates all delivery receipts and computes aggregate usage.
   *
   * @param input - Build proof bundle input
   * @returns The constructed ProofBundle
   */
  buildProofBundle(input: BuildProofBundleInput): ProofBundle {
    assertExecutionCommitment(input.commitment);

    if (!Array.isArray(input.receipts) || input.receipts.length === 0) {
      throw new TypeError("receipts must be a non-empty array of DeliveryReceipts.");
    }

    const commitmentHash = hashExecutionCommitment(input.commitment);
    const createdAt = input.createdAt !== undefined
      ? normalizeUIntString(input.createdAt, "createdAt")
      : Date.now().toString() as UnixMillis;

    // Validate all receipts belong to this commitment
    for (let i = 0; i < input.receipts.length; i++) {
      const receipt = input.receipts[i];
      if (receipt.taskContext.taskId !== input.commitment.taskId) {
        throw new TypeError(`receipts[${i}].taskContext.taskId must match commitment.taskId.`);
      }
      if (receipt.taskContext.commitmentHash !== commitmentHash) {
        throw new TypeError(`receipts[${i}].taskContext.commitmentHash must match commitmentHash.`);
      }
      if (receipt.taskContext.seller !== input.commitment.seller) {
        throw new TypeError(`receipts[${i}].taskContext.seller must match commitment.seller.`);
      }
    }

    // Compute aggregate usage
    const aggregateUsage = {
      totalTokens: input.receipts.reduce((sum, r) => sum + r.extracted.usage.totalTokens, 0)
    };

    const bundle: ProofBundle = {
      schemaVersion: SCHEMA_VERSIONS.proofBundle,
      taskId: input.commitment.taskId,
      commitmentHash,
      seller: input.commitment.seller,
      receipts: input.receipts,
      aggregateUsage,
      createdAt
    };

    // Validate the complete bundle
    assertProofBundle(bundle);

    return bundle;
  }

  /**
   * Upload a ProofBundle to storage.
   *
   * @param bundle - The proof bundle to upload
   * @returns Storage pointer and the uploaded bundle
   */
  async uploadProofBundle(bundle: ProofBundle): Promise<UploadProofBundleResult> {
    assertProofBundle(bundle);

    const pointer = await this.storageAdapter.putObject(bundle, {
      namespace: "proof-bundles"
    });

    // Verify hash integrity: the storage hash should match our computed hash
    const computedHash = hashProofBundle(bundle);
    if (pointer.hash !== computedHash) {
      throw new Error(
        `Storage hash mismatch: stored=${pointer.hash}, computed=${computedHash}. ` +
        "This indicates a storage integrity issue."
      );
    }

    return {
      pointer,
      bundle
    };
  }

  /**
   * Submit a proof bundle hash on-chain.
   *
   * This calls `submitProofBundle(taskId, proofBundleHash, proofBundleURI)` on the
   * FulfillPaySettlement contract, transitioning the task from FUNDED to PROOF_SUBMITTED.
   *
   * @param contract - The settlement contract instance (ethers Contract)
   * @param taskId - The task ID
   * @param proofBundleHash - The hash of the proof bundle
   * @param proofBundleURI - The URI where the proof bundle can be retrieved
   * @returns The submission result including tx hash
   */
  async submitProofBundleHash(
    contract: ContractLike,
    taskId: Bytes32,
    proofBundleHash: Bytes32,
    proofBundleURI: URI
  ): Promise<SubmitProofBundleHashResult> {
    const normalizedTaskId = normalizeBytes32(taskId, "taskId");
    const normalizedHash = normalizeBytes32(proofBundleHash, "proofBundleHash");

    if (!proofBundleURI || proofBundleURI.length === 0) {
      throw new TypeError("proofBundleURI must be a non-empty string.");
    }

    const tx = await contract.submitProofBundle(normalizedTaskId, normalizedHash, proofBundleURI);
    await tx.wait();

    return {
      txHash: tx.hash,
      taskId: normalizedTaskId,
      proofBundleHash: normalizedHash,
      proofBundleURI
    };
  }
}

/**
 * Compute a callIntentHash from task context and call details.
 */
function computeCallIntentHash(
  taskContext: TaskContext,
  callIndex: number,
  request: { host: string; path: string; method: string; body?: unknown },
  declaredModel: string
): Bytes32 {
  // Import hashCallIntent from sdk-core
  const taskContextHash = hashObject(taskContext);

  // Build request body hash
  const requestBodyHash = request.body !== undefined
    ? keccak256(toUtf8Bytes(JSON.stringify(request.body))) as Bytes32
    : keccak256(toUtf8Bytes("")) as Bytes32;

  // Build the CallIntent hash manually
  const callIntent = {
    schemaVersion: SCHEMA_VERSIONS.callIntent,
    taskContextHash,
    callIndex,
    host: request.host,
    path: request.path,
    method: request.method.toUpperCase(),
    declaredModel,
    requestBodyHash
  };

  return hashObject(callIntent);
}