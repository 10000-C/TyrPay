export const CONTRACT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "taskId", type: "bytes32" },
      { indexed: true, internalType: "bytes32", name: "commitmentHash", type: "bytes32" },
      { indexed: false, internalType: "string", name: "commitmentURI", type: "string" },
    ],
    name: "CommitmentSubmitted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "taskId", type: "bytes32" },
      { indexed: true, internalType: "bytes32", name: "proofBundleHash", type: "bytes32" },
      { indexed: false, internalType: "string", name: "proofBundleURI", type: "string" },
    ],
    name: "ProofBundleSubmitted",
    type: "event",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "taskId", type: "bytes32" },
      { internalType: "bytes32", name: "commitmentHash", type: "bytes32" },
      { internalType: "string", name: "commitmentURI", type: "string" },
    ],
    name: "submitCommitment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "taskId", type: "bytes32" },
      { internalType: "bytes32", name: "proofBundleHash", type: "bytes32" },
      { internalType: "string", name: "proofBundleURI", type: "string" },
    ],
    name: "submitProofBundle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
