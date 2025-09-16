import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { config } from "@/config/wagmi";
import { readContractsInBatch } from "@/lib/on-chain/readContractsInBatch";
import { toastifySendCallsTx } from "@/lib/toastify";
import { getUniswapTradeExecution } from "@/lib/trade/executeUniswapTrade";
import { getApprovals7702, getMaximumAmountIn } from "@/lib/trade/getApprovals7702";
import { getQuotes } from "@/lib/trade/getQuote";
import { ApprovalRequest, TableData, TradeProps, UniswapQuoteTradeResult } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import {
  AI_PREDICTION_MARKET_ID,
  CHAIN_ID,
  COLLATERAL_TOKENS,
  ROUTER_ADDRESSES,
  SupportedChain,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { Address, encodeFunctionData, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";
import { queryClient } from "@/config/queryClient";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

export function splitFromRouter(router: Address, amount: bigint): Execution {
  return {
    to: router,
    value: 0n,
    data: encodeFunctionData({
      abi: RouterAbi,
      functionName: "splitPosition",
      args: [collateral.address, AI_PREDICTION_MARKET_ID, amount],
    }),
  };
}

const fetchAllowances = async (
  account: Address,
  requesters: { address: Address; spender: Address }[]
) => {
  try {
    const allowances: bigint[] = await readContractsInBatch(
      requesters.map(({ address, spender }) => ({
        abi: erc20Abi,
        address,
        functionName: "allowance",
        args: [account, spender],
        chainId: CHAIN_ID,
      })),
      CHAIN_ID,
      50,
      true
    );
    return allowances.reduce((acc, curr, index) => {
      const { address, spender } = requesters[index];
      const allowanceKey = `${address}-${spender}`;
      acc[allowanceKey] = curr;
      return acc;
    }, {} as { [key: string]: bigint });
  } catch {
    return {};
  }
};

const checkAndAddApproveCalls = async ({
  account,
  amount,
  quotes,
}: {
  account: Address;
  amount: number;
  quotes: UniswapQuoteTradeResult[];
}) => {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const [buyQuotes, sellQuotes] = quotes.reduce(
    (acc, quote) => {
      acc[isTwoStringsEqual(quote.sellToken, collateral.address) ? 0 : 1].push(quote);
      return acc;
    },
    [[], []] as [UniswapQuoteTradeResult[], UniswapQuoteTradeResult[]]
  );
  // split + sell + buy approval requests
  const approvalRequests: ApprovalRequest[] = [
    {
      tokensAddresses: [collateral.address],
      account,
      spender: router,
      amounts: parseUnits(amount.toString(), collateral.decimals),
      chainId: CHAIN_ID,
    },
    ...sellQuotes.map(({ trade }) => ({
      tokensAddresses: [trade.executionPrice.baseCurrency.address as `0x${string}`],
      account,
      spender: trade.approveAddress as `0x${string}`,
      amounts: getMaximumAmountIn(trade),
      chainId: trade.chainId as SupportedChain,
    })),
    {
      tokensAddresses: [buyQuotes[0].trade.executionPrice.baseCurrency.address as `0x${string}`],
      account,
      spender: buyQuotes[0].trade.approveAddress as `0x${string}`,
      amounts: buyQuotes.reduce((acc, curr) => acc + getMaximumAmountIn(curr.trade), 0n),
      chainId: CHAIN_ID,
    },
  ];
  const allowanceMapping = await fetchAllowances(
    account,
    approvalRequests.map((request) => ({
      address: request.tokensAddresses[0],
      spender: request.spender,
    }))
  );

  const calls: Execution[] = [];
  // only add approvals without enough allowance

  approvalRequests.map((request) => {
    const { tokensAddresses, spender } = request;
    const amount = request.amounts as bigint;
    const allowanceKey = `${tokensAddresses[0]}-${spender}`;
    if (amount > allowanceMapping[allowanceKey]) {
      calls.push(...getApprovals7702(request));
    }
  });

  return calls;
};

const executeTradeStrategy = async ({
  account,
  amount,
  tableData,
  chainId,
  collateral,
}: TradeProps) => {
  // get quotes
  const quotes = await getQuotes({ account, amount, tableData, chainId, collateral });
  // split first
  const parsedSplitAmount = parseUnits(amount.toString(), collateral.decimals);
  const router = ROUTER_ADDRESSES[CHAIN_ID];

  // get all approvals
  const calls = await checkAndAddApproveCalls({ account, amount, quotes });

  // push split transaction
  calls.push(splitFromRouter(router, parsedSplitAmount));

  // // push trade transactions
  const tradeTransactions = await Promise.all(
    quotes.map(({ trade }) => getUniswapTradeExecution(trade, account))
  );
  calls.push(...tradeTransactions);
  const result = await toastifySendCallsTx(calls, config, {
    txSent: { title: "Executing trade..." },
    txSuccess: { title: "Trade executed!" },
  });

  if (!result.status) {
    throw result.error;
  }

  return result.receipt;
};

export const useExecuteTradeStrategy = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: ({
      account,
      amount,
      tableData,
    }: {
      account: Address;
      amount: number;
      tableData: TableData[];
    }) => executeTradeStrategy({ account, amount, tableData, chainId: CHAIN_ID, collateral }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useMarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
      }, 3000);
    },
  });
};
