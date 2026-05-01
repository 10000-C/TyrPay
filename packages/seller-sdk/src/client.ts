import { Contract, ethers } from "ethers";
import type { HexString, ExecutionCommitment, ProofBundle } from "@fulfillpay/sdk-core";
import { hashExecutionCommitment, hashProofBundle } from "@fulfillpay/sdk-core";
import type {
  SellerClientConfig,
  SubmitCommitmentParams,
  SubmitCommitmentResult,
  SubmitProofBundleParams,
  SubmitProofBundleResult,
} from "./types.js";
import { CONTRACT_ABI } from "./abi.js";

export class SellerClient {
  private config: SellerClientConfig;
  private contract: Contract;

  constructor(config: SellerClientConfig) {
    this.config = config;
    this.contract = new Contract(config.contractAddress, CONTRACT_ABI, config.signer);
  }

  async submitCommitment(params: SubmitCommitmentParams): Promise<SubmitCommitmentResult> {
    const commitmentHash = hashExecutionCommitment(params.commitment);

    // Store commitment
    await this.config.storage.store(`commitment:${params.taskId}`, params.commitment);

    // For URI, use a storage key reference
    const commitmentURI = `fulfillpay://commitment/${params.taskId}`;

    const tx = await this.contract.submitCommitment(
      params.taskId,
      commitmentHash,
      commitmentURI,
    );
    const receipt = await tx.wait();

    // Parse CommitmentSubmitted event
    const iface = new ethers.Interface(CONTRACT_ABI);
    let emittedHash: HexString = commitmentHash;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed && parsed.name === "CommitmentSubmitted") {
          emittedHash = parsed.args[1] as HexString;
          break;
        }
      } catch {
        /* skip */
      }
    }

    return { taskId: params.taskId, commitmentHash: emittedHash, commitmentURI };
  }

  async submitProofBundle(params: SubmitProofBundleParams): Promise<SubmitProofBundleResult> {
    const proofBundleHash = hashProofBundle(params.proofBundle);

    // Store proof bundle
    await this.config.storage.store(`proof-bundle:${params.taskId}`, params.proofBundle);

    const proofBundleURI = `fulfillpay://proof-bundle/${params.taskId}`;

    const tx = await this.contract.submitProofBundle(
      params.taskId,
      proofBundleHash,
      proofBundleURI,
    );
    const receipt = await tx.wait();

    // Parse ProofBundleSubmitted event
    const iface = new ethers.Interface(CONTRACT_ABI);
    let emittedHash: HexString = proofBundleHash;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed && parsed.name === "ProofBundleSubmitted") {
          emittedHash = parsed.args[1] as HexString;
          break;
        }
      } catch {
        /* skip */
      }
    }

    return { taskId: params.taskId, proofBundleHash: emittedHash, proofBundleURI };
  }
}
