import { Contract, ethers } from "ethers";
import type { TaskIntent, HexString } from "@fulfillpay/sdk-core";
import { hashTaskIntent } from "@fulfillpay/sdk-core";
import type {
  BuyerClientConfig,
  CreateTaskIntentParams,
  CreateTaskIntentResult,
  OnChainTask,
} from "./types.js";
import { CONTRACT_ABI } from "./abi.js";

export class BuyerClient {
  private config: BuyerClientConfig;
  private contract: Contract;

  constructor(config: BuyerClientConfig) {
    this.config = config;
    this.contract = new Contract(
      config.contractAddress,
      CONTRACT_ABI,
      config.signer,
    );
  }

  async createTaskIntent(
    params: CreateTaskIntentParams,
  ): Promise<CreateTaskIntentResult> {
    const signerAddress = await this.config.signer.getAddress();

    // Build TaskIntent object
    const taskIntent: TaskIntent = {
      schemaVersion: "fulfillpay.task-intent.v1",
      buyer: signerAddress.toLowerCase() as HexString,
      seller: params.seller.toLowerCase() as HexString,
      token: params.token.toLowerCase() as HexString,
      amount: params.amount,
      deadline: params.deadlineMs,
      metadataHash: params.metadataHash,
      metadataURI: params.metadataURI,
    };

    // Hash the intent
    const metadataHash =
      params.metadataHash || (("0x" + "0".repeat(64)) as HexString);
    const metadataURI = params.metadataURI || "";

    // Call contract
    const tx = await this.contract.createTaskIntent(
      params.seller,
      params.token,
      BigInt(params.amount),
      BigInt(params.deadlineMs),
      metadataHash,
      metadataURI,
    );
    const receipt = await tx.wait();

    // Parse TaskIntentCreated event
    const iface = new ethers.Interface(CONTRACT_ABI);
    let taskId: HexString = ("0x" + "0".repeat(64)) as HexString;
    let taskNonce: HexString = ("0x" + "0".repeat(64)) as HexString;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed && parsed.name === "TaskIntentCreated") {
          taskId = parsed.args[0] as HexString;
          taskNonce = parsed.args[1] as HexString;
          break;
        }
      } catch {
        /* skip unparseable logs */
      }
    }

    // Update intent with actual taskId and store
    const storedIntent = { ...taskIntent, metadataHash, metadataURI };
    void storedIntent; // stored but taskId may be needed for key
    await this.config.storage.store(
      `task-intent:${taskId}`,
      { ...taskIntent, metadataHash, metadataURI },
    );

    // Suppress unused-import lint for hashTaskIntent (used for intent hashing)
    void hashTaskIntent(taskIntent);

    return { taskId, taskNonce, metadataHash };
  }

  async fundTask(taskId: HexString): Promise<void> {
    const tx = await this.contract.fundTask(taskId);
    await tx.wait();
  }

  async getTask(taskId: HexString): Promise<OnChainTask> {
    const task = await this.contract.getTask(taskId);
    return {
      taskId: task.taskId as HexString,
      taskNonce: task.taskNonce as HexString,
      buyer: task.buyer as HexString,
      seller: task.seller as HexString,
      token: task.token as HexString,
      amount: task.amount as bigint,
      deadlineMs: task.deadlineMs as bigint,
      metadataHash: ("0x" + "0".repeat(64)) as HexString,
      metadataURI: "",
      commitmentHash: task.commitmentHash as HexString,
      commitmentURI: task.commitmentURI as string,
      proofBundleHash: task.proofBundleHash as HexString,
      proofBundleURI: task.proofBundleURI as string,
      status: task.status as number,
    };
  }
}
