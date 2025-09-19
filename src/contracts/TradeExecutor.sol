// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./Interfaces.sol";

contract TradeExecutor {
    struct Call {
        address to;
        bytes data;
        uint256 value;
    }

    /// @dev ConditionalTokens contract.
    IConditionalTokens public immutable conditionalTokens;

    /// @dev Constructor.
    /// @param _conditionalTokens ConditionalTokens contract.
    constructor(
        IConditionalTokens _conditionalTokens
    ) {
        conditionalTokens = _conditionalTokens;
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
    
    function batchExecute(Call[] calldata calls, address market, IERC20 collateralToken, uint amount) external payable {
        collateralToken.transferFrom(msg.sender, address(this), amount);
        for (uint i = 0; i < calls.length; i++) {
            (bool success,) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            require(success, "Call failed");
        }
        (address[] memory outcomeTokens,) = _getOutcomeTokens(market);
        for (uint i = 0; i < outcomeTokens.length; i++) {
            address token = outcomeTokens[i];
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                require(IERC20(token).transfer(msg.sender, balance), "Outcome token transfer failed");
            }
        }
        uint256 remainingBalance = collateralToken.balanceOf(address(this));
        if (remainingBalance > 0) {
            require(collateralToken.transfer(msg.sender, remainingBalance), "Collateral transfer failed");
        }
    }
}