// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TradeExecutor is ReentrancyGuard {
    struct Call {
        address to;
        bytes data;
    }
    
    /// @dev Contract owner
    address public immutable owner;
    
    /// @dev Modifier to restrict access to owner only
    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    /// @dev Constructor.
    /// @param _owner Immutable owner of the contract.
    constructor(
        address _owner
    ) {
        require(_owner != address(0), "Owner cannot be zero address");
        owner = _owner;
    }
    
    /// @dev Execute calls in a single transaction, sending any remaining tokens back to owner. Only callable by owner.
    /// @param calls Array of calls to execute
    function batchExecute(Call[] calldata calls, address[] calldata tokens) external onlyOwner nonReentrant {
        for (uint i = 0; i < calls.length; i++) {
            (bool success,) = calls[i].to.call(calls[i].data);
            require(success, "Call failed");
        }

        for (uint i = 0; i < tokens.length; i++) {
            uint256 balance = IERC20(tokens[i]).balanceOf(address(this));
            if (balance > 0) {
                require(IERC20(tokens[i]).transfer(msg.sender, balance), "Token withdrawn failed");
            }
        }
    }
}
