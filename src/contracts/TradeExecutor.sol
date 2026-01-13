// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract TradeExecutor {
    struct Call {
        address to;
        bytes data;
    }

    struct ValueCall {
        address to;
        uint256 value;
        bytes data;
    }
    
    /// @dev Contract owner
    address public immutable owner;

    /// @dev sessionKey uses to call contract function
    address public sessionKey;
    
    /// @dev Modifier to restrict access to owner only
    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    /// @dev Modifier to restrict access to sessionKey only
    modifier onlySessionKey() {
        require(msg.sender == owner || msg.sender == sessionKey, "Caller is not the owner or sessionKey");
        _;
    }

    /// @dev Constructor.
    /// @param _owner Immutable owner of the contract.
    constructor(
        address _owner
    ) {
        owner = _owner;
        sessionKey = _owner;
    }

    /// @dev set session key to call the contract functions. Only callable by owner.
    function setSessionKey(address _sessionKey) external onlyOwner {
        sessionKey = _sessionKey;
    }
    
    /// @dev Execute calls in a single transaction. Only callable by the session key.
    /// @param calls Array of calls to execute
    function batchExecute(Call[] calldata calls) external onlySessionKey {
        for (uint i = 0; i < calls.length; i++) {
            (bool success,) = calls[i].to.call(calls[i].data);
            require(success, "Call failed");
        }
    }

    /// @dev Execute calls with value in a single transaction. Only callable by the session key.
    /// @param calls Array of calls to execute
    function batchValueExecute(ValueCall[] calldata calls) external payable onlySessionKey {
        for (uint i = 0; i < calls.length; i++) {
            (bool success,) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            require(success, "Call failed");
        }
    }

    /// @dev Receive ETH.
    receive() external payable { }
}