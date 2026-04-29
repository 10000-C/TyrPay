// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        address initialAccount,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        if (initialAccount != address(0) && initialSupply > 0) {
            _mint(initialAccount, initialSupply);
        }
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
