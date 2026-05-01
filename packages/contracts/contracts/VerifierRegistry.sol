// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VerifierRegistry is Ownable {
    mapping(address verifier => bool authorized) private authorizedVerifiers;

    event VerifierAdded(address indexed verifier);
    event VerifierRemoved(address indexed verifier);

    error ZeroAddress();

    constructor(address initialOwner) {
        _transferOwnership(initialOwner);
    }

    function addVerifier(address verifier) external onlyOwner {
        if (verifier == address(0)) {
            revert ZeroAddress();
        }

        authorizedVerifiers[verifier] = true;
        emit VerifierAdded(verifier);
    }

    function removeVerifier(address verifier) external onlyOwner {
        if (verifier == address(0)) {
            revert ZeroAddress();
        }

        authorizedVerifiers[verifier] = false;
        emit VerifierRemoved(verifier);
    }

    function isVerifier(address verifier) external view returns (bool) {
        return authorizedVerifiers[verifier];
    }
}
