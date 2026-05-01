/**
 * Subset of the FulfillPaySettlement contract ABI needed by the Buyer SDK.
 * Only includes functions and events used by BuyerClient.
 */

export const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "uint256", name: "deadlineMs", type: "uint256" },
      { internalType: "bytes32", name: "metadataHash", type: "bytes32" },
      { internalType: "string", name: "metadataURI", type: "string" },
    ],
    name: "createTaskIntent",
    outputs: [
      { internalType: "bytes32", name: "taskId", type: "bytes32" },
      { internalType: "bytes32", name: "taskNonce", type: "bytes32" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "taskId", type: "bytes32" }],
    name: "fundTask",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "taskId", type: "bytes32" }],
    name: "getTask",
    outputs: [
      {
        components: [
          { internalType: "bytes32", name: "taskId", type: "bytes32" },
          { internalType: "bytes32", name: "taskNonce", type: "bytes32" },
          { internalType: "address", name: "buyer", type: "address" },
          { internalType: "address", name: "seller", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "uint256", name: "deadlineMs", type: "uint256" },
          { internalType: "bytes32", name: "commitmentHash", type: "bytes32" },
          { internalType: "string", name: "commitmentURI", type: "string" },
          { internalType: "uint256", name: "fundedAtMs", type: "uint256" },
          { internalType: "bytes32", name: "proofBundleHash", type: "bytes32" },
          { internalType: "string", name: "proofBundleURI", type: "string" },
          { internalType: "uint256", name: "proofSubmittedAtMs", type: "uint256" },
          { internalType: "bytes32", name: "reportHash", type: "bytes32" },
          { internalType: "uint256", name: "settledAtMs", type: "uint256" },
          { internalType: "uint256", name: "refundedAtMs", type: "uint256" },
          {
            internalType: "enum FulfillPaySettlement.TaskStatus",
            name: "status",
            type: "uint8",
          },
        ],
        internalType: "struct FulfillPaySettlement.Task",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "taskId", type: "bytes32" },
      { indexed: true, internalType: "bytes32", name: "taskNonce", type: "bytes32" },
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "address", name: "seller", type: "address" },
      { indexed: false, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "deadlineMs", type: "uint256" },
      { indexed: false, internalType: "bytes32", name: "metadataHash", type: "bytes32" },
      { indexed: false, internalType: "string", name: "metadataURI", type: "string" },
    ],
    name: "TaskIntentCreated",
    type: "event",
  },
] as const;
