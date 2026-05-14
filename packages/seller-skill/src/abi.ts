export const TYRPAY_SETTLEMENT_ABI = [
  "function submitCommitment(bytes32 taskId,bytes32 commitmentHash,string commitmentURI)",
  "function submitProofBundle(bytes32 taskId,bytes32 proofBundleHash,string proofBundleURI)",
  "function getTask(bytes32 taskId) view returns ((bytes32 taskId, bytes32 taskNonce, address buyer, address seller, address token, uint256 amount, uint256 deadlineMs, bytes32 commitmentHash, string commitmentURI, uint256 fundedAtMs, bytes32 proofBundleHash, string proofBundleURI, uint256 proofSubmittedAtMs, bytes32 reportHash, uint256 settledAtMs, uint256 refundedAtMs, uint8 status))"
] as const;
