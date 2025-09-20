// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./Interfaces.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TradeExecutor is ReentrancyGuard {
    struct Call {
        address to;
        bytes data;
    }

    /// @dev ConditionalTokens contract.
    IConditionalTokens public immutable conditionalTokens;
    
    /// @dev Contract owner
    address public immutable owner;
    
    /// @dev Modifier to restrict access to owner only
    modifier onlyOwner() {
        require(msg.sender == owner, "TradeExecutor: caller is not the owner");
        _;
    }

    /// @dev Constructor.
    /// @param _conditionalTokens ConditionalTokens contract.
    /// @param _owner Immutable owner of the contract.
    constructor(
        IConditionalTokens _conditionalTokens,
        address _owner
    ) {
        require(_owner != address(0), "TradeExecutor: owner cannot be zero address");
        conditionalTokens = _conditionalTokens;
        owner = _owner;
    }

    function _getOutcomeTokens(address market)
        internal
        view
        returns (address[] memory outcomeTokens, uint256 outcomeCount)
    {
        bytes32 conditionId = IMarket(market).conditionId();
        outcomeCount = conditionalTokens.getOutcomeSlotCount(
            conditionId
        );
        outcomeTokens = new address[](outcomeCount);

        for (uint256 i = 0; i < outcomeCount; i++) {
            (IERC20 wrapped1155, ) = IMarket(market).wrappedOutcome(i);
            outcomeTokens[i] = address(wrapped1155);
        }
    }
    
    /// @dev Execute multiple calls in a single transaction. Only callable by owner.
    /// @param calls Array of calls to execute
    function batchExecute(Call[] calldata calls) external onlyOwner nonReentrant {
        for (uint i = 0; i < calls.length; i++) {
            (bool success,) = calls[i].to.call(calls[i].data);
             require(success, "TradeExecutor: call failed");
        }
    }

    /// @dev Execute trade calls in a single transaction, sending any remaining tokens back to owner. Only callable by owner.
    /// @param calls Array of calls to execute
    function tradeExecute(Call[] calldata calls, address market, IERC20 collateralToken) external onlyOwner nonReentrant {
        for (uint i = 0; i < calls.length; i++) {
            (bool success,) = calls[i].to.call(calls[i].data);
             require(success, "TradeExecutor: call failed");
        }

        // return any outcome tokens produced to msg.sender (owner)
        (address[] memory outcomeTokens,) = _getOutcomeTokens(market);
        for (uint i = 0; i < outcomeTokens.length; i++) {
            address token = outcomeTokens[i];
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                require(IERC20(token).transfer(msg.sender, balance), "Outcome token transfer failed");
            }
        }

        // return remaining collateral
        uint256 remainingBalance = collateralToken.balanceOf(address(this));
        if (remainingBalance > 0) {
            require(collateralToken.transfer(msg.sender, remainingBalance), "Collateral transfer failed");
        }
    }
}
