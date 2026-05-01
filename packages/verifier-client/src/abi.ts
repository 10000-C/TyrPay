/**
 * Minimal ABI for the FulFilPay settlement contract.
 * Only includes the `settle` function and settlement-related events
 * needed by the VerifierClient.
 */

export const CONTRACT_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "bytes32", name: "taskId", type: "bytes32" },
          { internalType: "address", name: "buyer", type: "address" },
          { internalType: "address", name: "seller", type: "address" },
          { internalType: "bytes32", name: "commitmentHash", type: "bytes32" },
          { internalType: "bytes32", name: "proofBundleHash", type: "bytes32" },
          { internalType: "bool", name: "passed", type: "bool" },
          { internalType: "uint8", name: "settlementAction", type: "uint8" },
          { internalType: "uint256", name: "settlementAmount", type: "uint256" },
          { internalType: "uint256", name: "verifiedAt", type: "uint256" },
          { internalType: "bytes32", name: "reportHash", type: "bytes32" },
        ],
        internalType: "struct FulfillPaySettlement.VerificationReport",
        name: "report",
        type: "tuple",
      },
      { internalType: "bytes", name: "signature", type: "bytes" },
    ],
    name: "settle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "taskId", type: "bytes32" },
      { indexed: true, internalType: "bytes32", name: "proofBundleHash", type: "bytes32" },
      { indexed: false, internalType: "bytes32", name: "reportHash", type: "bytes32" },
      { indexed: false, internalType: "address", name: "verifier", type: "address" },
      { indexed: false, internalType: "uint256", name: "settledAtMs", type: "uint256" },
    ],
    name: "TaskSettled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "taskId", type: "bytes32" },
      { indexed: true, internalType: "bytes32", name: "proofBundleHash", type: "bytes32" },
      { indexed: false, internalType: "bytes32", name: "reportHash", type: "bytes32" },
      { indexed: false, internalType: "address", name: "verifier", type: "address" },
      { indexed: false, internalType: "uint256", name: "refundedAtMs", type: "uint256" },
    ],
    name: "TaskRefunded",
    type: "event",
  },
] as const;
