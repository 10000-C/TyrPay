// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IVerifierRegistry {
    function isVerifier(address verifier) external view returns (bool);
}

contract TyrPaySettlement is EIP712, Ownable {
    using SafeERC20 for IERC20;

    string public constant EIP712_NAME = "TyrPay";
    string public constant EIP712_VERSION = "1";

    uint8 public constant SETTLEMENT_ACTION_RELEASE = 1;
    uint8 public constant SETTLEMENT_ACTION_REFUND = 2;

    bytes32 public constant VERIFICATION_REPORT_TYPEHASH =
        keccak256(
            "VerificationReport(bytes32 taskId,address buyer,address seller,bytes32 commitmentHash,bytes32 proofBundleHash,bool passed,uint8 settlementAction,uint256 settlementAmount,uint256 verifiedAt,bytes32 reportHash)"
        );

    enum TaskStatus {
        INTENT_CREATED,
        COMMITMENT_SUBMITTED,
        FUNDED,
        PROOF_SUBMITTED,
        SETTLED,
        REFUNDED
    }

    struct Task {
        bytes32 taskId;
        bytes32 taskNonce;
        address buyer;
        address seller;
        address token;
        uint256 amount;
        uint256 deadlineMs;
        bytes32 commitmentHash;
        string commitmentURI;
        uint256 fundedAtMs;
        bytes32 proofBundleHash;
        string proofBundleURI;
        uint256 proofSubmittedAtMs;
        bytes32 reportHash;
        uint256 settledAtMs;
        uint256 refundedAtMs;
        TaskStatus status;
    }

    struct VerificationReport {
        bytes32 taskId;
        address buyer;
        address seller;
        bytes32 commitmentHash;
        bytes32 proofBundleHash;
        bool passed;
        uint8 settlementAction;
        uint256 settlementAmount;
        uint256 verifiedAt;
        bytes32 reportHash;
    }

    IVerifierRegistry public immutable verifierRegistry;
    uint256 public immutable proofSubmissionGracePeriodMs;
    uint256 public immutable verificationTimeoutMs;

    uint256 public nextSequence = 1;

    mapping(bytes32 taskId => Task task) private tasks;
    mapping(bytes32 proofBundleHash => bool used) public usedProofBundleHash;
    mapping(address token => bool allowed) public allowedTokens;

    event TaskIntentCreated(
        bytes32 indexed taskId,
        bytes32 indexed taskNonce,
        address indexed buyer,
        address seller,
        address token,
        uint256 amount,
        uint256 deadlineMs,
        bytes32 metadataHash,
        string metadataURI
    );
    event CommitmentSubmitted(bytes32 indexed taskId, bytes32 indexed commitmentHash, string commitmentURI);
    event TaskFunded(bytes32 indexed taskId, uint256 fundedAtMs);
    event ProofBundleSubmitted(bytes32 indexed taskId, bytes32 indexed proofBundleHash, string proofBundleURI);
    event TaskSettled(
        bytes32 indexed taskId,
        bytes32 indexed proofBundleHash,
        bytes32 reportHash,
        address verifier,
        uint256 settledAtMs
    );
    event TaskRefunded(
        bytes32 indexed taskId,
        bytes32 indexed proofBundleHash,
        bytes32 reportHash,
        address verifier,
        uint256 refundedAtMs
    );
    event TokenAllowed(address indexed token, bool allowed);

    error EmptyHash();
    error EmptyReportHash();
    error EmptyURI();
    error InvalidConfig();
    error InvalidReportBinding();
    error InvalidSettlementAction();
    error InvalidSettlementAmount();
    error InvalidTaskState();
    error OnlyBuyer();
    error OnlySeller();
    error ProofBundleAlreadyUsed();
    error ProofSubmissionWindowClosed();
    error ReportExpired();
    error TimeoutNotReached();
    error TaskExpired();
    error TaskNotFound();
    error TokenNotAllowed();
    error UnauthorizedVerifier();
    error ZeroAddress();
    error ZeroAmount();

    constructor(address verifierRegistry_, uint256 proofSubmissionGracePeriodMs_, uint256 verificationTimeoutMs_)
        EIP712(EIP712_NAME, EIP712_VERSION)
    {
        if (verifierRegistry_ == address(0)) {
            revert ZeroAddress();
        }
        if (proofSubmissionGracePeriodMs_ == 0 || verificationTimeoutMs_ == 0) {
            revert InvalidConfig();
        }

        verifierRegistry = IVerifierRegistry(verifierRegistry_);
        proofSubmissionGracePeriodMs = proofSubmissionGracePeriodMs_;
        verificationTimeoutMs = verificationTimeoutMs_;
    }

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        if (token == address(0)) {
            revert ZeroAddress();
        }

        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    function createTaskIntent(
        address seller,
        address token,
        uint256 amount,
        uint256 deadlineMs,
        bytes32 metadataHash,
        string calldata metadataURI
    ) external returns (bytes32 taskId, bytes32 taskNonce) {
        if (seller == address(0) || token == address(0)) {
            revert ZeroAddress();
        }
        if (!allowedTokens[token]) {
            revert TokenNotAllowed();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }
        if (deadlineMs <= _currentTimeMs()) {
            revert TaskExpired();
        }

        uint256 sequence = nextSequence++;
        taskId = keccak256(abi.encode(address(this), block.chainid, msg.sender, sequence));
        taskNonce = keccak256(abi.encode(taskId, msg.sender, seller));

        Task storage task = tasks[taskId];
        task.taskId = taskId;
        task.taskNonce = taskNonce;
        task.buyer = msg.sender;
        task.seller = seller;
        task.token = token;
        task.amount = amount;
        task.deadlineMs = deadlineMs;
        task.status = TaskStatus.INTENT_CREATED;

        emit TaskIntentCreated(taskId, taskNonce, msg.sender, seller, token, amount, deadlineMs, metadataHash, metadataURI);
    }

    function submitCommitment(bytes32 taskId, bytes32 commitmentHash, string calldata commitmentURI) external {
        Task storage task = _getExistingTask(taskId);
        if (task.status != TaskStatus.INTENT_CREATED) {
            revert InvalidTaskState();
        }
        if (msg.sender != task.seller) {
            revert OnlySeller();
        }
        if (commitmentHash == bytes32(0)) {
            revert EmptyHash();
        }
        if (bytes(commitmentURI).length == 0) {
            revert EmptyURI();
        }
        if (task.deadlineMs <= _currentTimeMs()) {
            revert TaskExpired();
        }

        task.commitmentHash = commitmentHash;
        task.commitmentURI = commitmentURI;
        task.status = TaskStatus.COMMITMENT_SUBMITTED;

        emit CommitmentSubmitted(taskId, commitmentHash, commitmentURI);
    }

    function fundTask(bytes32 taskId) external {
        Task storage task = _getExistingTask(taskId);
        if (task.status != TaskStatus.COMMITMENT_SUBMITTED) {
            revert InvalidTaskState();
        }
        if (msg.sender != task.buyer) {
            revert OnlyBuyer();
        }
        if (!allowedTokens[task.token]) {
            revert TokenNotAllowed();
        }

        uint256 nowMs = _currentTimeMs();
        if (nowMs > task.deadlineMs) {
            revert TaskExpired();
        }

        IERC20(task.token).safeTransferFrom(msg.sender, address(this), task.amount);

        task.fundedAtMs = nowMs;
        task.status = TaskStatus.FUNDED;

        emit TaskFunded(taskId, task.fundedAtMs);
    }

    function submitProofBundle(bytes32 taskId, bytes32 proofBundleHash, string calldata proofBundleURI) external {
        Task storage task = _getExistingTask(taskId);
        if (task.status != TaskStatus.FUNDED) {
            revert InvalidTaskState();
        }
        if (msg.sender != task.seller) {
            revert OnlySeller();
        }
        if (proofBundleHash == bytes32(0)) {
            revert EmptyHash();
        }
        if (bytes(proofBundleURI).length == 0) {
            revert EmptyURI();
        }
        if (_currentTimeMs() > task.deadlineMs + proofSubmissionGracePeriodMs) {
            revert ProofSubmissionWindowClosed();
        }

        task.proofBundleHash = proofBundleHash;
        task.proofBundleURI = proofBundleURI;
        task.proofSubmittedAtMs = _currentTimeMs();
        task.status = TaskStatus.PROOF_SUBMITTED;

        emit ProofBundleSubmitted(taskId, proofBundleHash, proofBundleURI);
    }

    function settle(VerificationReport calldata report, bytes calldata signature) external {
        Task storage task = _getExistingTask(report.taskId);
        if (task.status != TaskStatus.PROOF_SUBMITTED) {
            revert InvalidTaskState();
        }
        if (report.reportHash == bytes32(0)) {
            revert EmptyReportHash();
        }
        if (usedProofBundleHash[report.proofBundleHash]) {
            revert ProofBundleAlreadyUsed();
        }
        if (
            report.taskId != task.taskId || report.buyer != task.buyer || report.seller != task.seller
                || report.commitmentHash != task.commitmentHash || report.proofBundleHash != task.proofBundleHash
        ) {
            revert InvalidReportBinding();
        }
        if (report.settlementAmount != task.amount) {
            revert InvalidSettlementAmount();
        }
        if (report.verifiedAt > task.proofSubmittedAtMs + verificationTimeoutMs) {
            revert ReportExpired();
        }
        if (
            (report.passed && report.settlementAction != SETTLEMENT_ACTION_RELEASE)
                || (!report.passed && report.settlementAction != SETTLEMENT_ACTION_REFUND)
        ) {
            revert InvalidSettlementAction();
        }

        address recoveredVerifier = ECDSA.recover(_hashTypedDataV4(_hashVerificationReport(report)), signature);
        if (!verifierRegistry.isVerifier(recoveredVerifier)) {
            revert UnauthorizedVerifier();
        }

        usedProofBundleHash[report.proofBundleHash] = true;
        task.reportHash = report.reportHash;

        if (report.passed) {
            task.status = TaskStatus.SETTLED;
            task.settledAtMs = _currentTimeMs();
            IERC20(task.token).safeTransfer(task.seller, task.amount);
            emit TaskSettled(task.taskId, task.proofBundleHash, report.reportHash, recoveredVerifier, task.settledAtMs);
        } else {
            task.status = TaskStatus.REFUNDED;
            task.refundedAtMs = _currentTimeMs();
            IERC20(task.token).safeTransfer(task.buyer, task.amount);
            emit TaskRefunded(task.taskId, task.proofBundleHash, report.reportHash, recoveredVerifier, task.refundedAtMs);
        }
    }

    function refundAfterProofSubmissionDeadline(bytes32 taskId) external {
        Task storage task = _getExistingTask(taskId);
        if (task.status != TaskStatus.FUNDED) {
            revert InvalidTaskState();
        }
        if (_currentTimeMs() <= task.deadlineMs + proofSubmissionGracePeriodMs) {
            revert TimeoutNotReached();
        }

        task.status = TaskStatus.REFUNDED;
        task.refundedAtMs = _currentTimeMs();
        IERC20(task.token).safeTransfer(task.buyer, task.amount);

        emit TaskRefunded(task.taskId, bytes32(0), bytes32(0), address(0), task.refundedAtMs);
    }

    function refundAfterVerificationTimeout(bytes32 taskId) external {
        Task storage task = _getExistingTask(taskId);
        if (task.status != TaskStatus.PROOF_SUBMITTED) {
            revert InvalidTaskState();
        }
        if (_currentTimeMs() <= task.proofSubmittedAtMs + verificationTimeoutMs) {
            revert TimeoutNotReached();
        }

        task.status = TaskStatus.REFUNDED;
        task.refundedAtMs = _currentTimeMs();
        IERC20(task.token).safeTransfer(task.buyer, task.amount);

        emit TaskRefunded(task.taskId, task.proofBundleHash, bytes32(0), address(0), task.refundedAtMs);
    }

    function getTask(bytes32 taskId) external view returns (Task memory) {
        return _getExistingTask(taskId);
    }

    function domainSeparatorV4() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function hashVerificationReport(VerificationReport calldata report) external pure returns (bytes32) {
        return _hashVerificationReport(report);
    }

    function hashTypedVerificationReport(VerificationReport calldata report) external view returns (bytes32) {
        return _hashTypedDataV4(_hashVerificationReport(report));
    }

    function currentTimeMs() external view returns (uint256) {
        return _currentTimeMs();
    }

    function _hashVerificationReport(VerificationReport calldata report) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                VERIFICATION_REPORT_TYPEHASH,
                report.taskId,
                report.buyer,
                report.seller,
                report.commitmentHash,
                report.proofBundleHash,
                report.passed,
                report.settlementAction,
                report.settlementAmount,
                report.verifiedAt,
                report.reportHash
            )
        );
    }

    function _getExistingTask(bytes32 taskId) internal view returns (Task storage task) {
        task = tasks[taskId];
        if (task.buyer == address(0)) {
            revert TaskNotFound();
        }
    }

    function _currentTimeMs() internal view returns (uint256) {
        return block.timestamp * 1000;
    }
}
