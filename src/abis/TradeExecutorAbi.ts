export const TradeExecutorAbi = [
	{
		"inputs": [
			{
				"internalType": "contract IConditionalTokens",
				"name": "_conditionalTokens",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [
			{
				"components": [
					{
						"internalType": "address",
						"name": "to",
						"type": "address"
					},
					{
						"internalType": "bytes",
						"name": "data",
						"type": "bytes"
					},
					{
						"internalType": "uint256",
						"name": "value",
						"type": "uint256"
					}
				],
				"internalType": "struct TradeExecutor.Call[]",
				"name": "calls",
				"type": "tuple[]"
			},
			{
				"internalType": "address",
				"name": "market",
				"type": "address"
			},
			{
				"internalType": "contract IERC20",
				"name": "collateralToken",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "batchExecute",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "conditionalTokens",
		"outputs": [
			{
				"internalType": "contract IConditionalTokens",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]
