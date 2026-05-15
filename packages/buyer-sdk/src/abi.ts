export const TyrPaySettlementAbi = [
  "event TaskIntentCreated(bytes32 indexed taskId, bytes32 indexed taskNonce, address indexed buyer, address seller, address token, uint256 amount, uint256 deadlineMs, bytes32 metadataHash, string metadataURI)",
  "function createTaskIntent(address seller,address token,uint256 amount,uint256 deadlineMs,bytes32 metadataHash,string metadataURI) returns (bytes32 taskId, bytes32 taskNonce)",
  "function fundTask(bytes32 taskId)",
  "function refundAfterProofSubmissionDeadline(bytes32 taskId)",
  "function refundAfterVerificationTimeout(bytes32 taskId)",
  "function getTask(bytes32 taskId) view returns ((bytes32 taskId, bytes32 taskNonce, address buyer, address seller, address token, uint256 amount, uint256 deadlineMs, bytes32 commitmentHash, string commitmentURI, uint256 fundedAtMs, bytes32 proofBundleHash, string proofBundleURI, uint256 proofSubmittedAtMs, bytes32 reportHash, uint256 settledAtMs, uint256 refundedAtMs, uint8 status))",
  "function currentTimeMs() view returns (uint256)",
  "function proofSubmissionGracePeriodMs() view returns (uint256)",
  "function verificationTimeoutMs() view returns (uint256)"
] as const;
