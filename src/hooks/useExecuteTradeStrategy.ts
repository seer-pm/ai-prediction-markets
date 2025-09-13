import { RouterAbi } from "@/abis/RouterAbi";
import { config } from "@/config/wagmi";
import { toastifyTx } from "@/lib/toastify";
import { getUniswapTradeExecution } from "@/lib/trade/executeUniswapTrade";
import {
  getApprovals7702,
  getMaximumAmountIn,
  getTradeApprovals7702,
} from "@/lib/trade/getApprovals7702";
import { getQuotes } from "@/lib/trade/getQuote";
import { TableData, TradeProps, UniswapQuoteTradeResult } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import {
  AI_PREDICTION_MARKET_ID,
  CHAIN_ID,
  COLLATERAL_TOKENS,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { sendCalls } from "@wagmi/core";
import { Address, encodeFunctionData, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";

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

const executeTradeStrategy = async ({
  account,
  amount,
  tableData,
  chainId,
  collateral,
}: TradeProps) => {
  const quotes = await getQuotes({ account, amount, tableData, chainId, collateral });

  // split first
  const parsedSplitAmount = parseUnits(amount.toString(), collateral.decimals);
  const router = ROUTER_ADDRESSES[CHAIN_ID];

  //get split approvals

  const calls: Execution[] = getApprovals7702({
    tokensAddresses: [collateral.address],
    account,
    spender: router,
    amounts: parsedSplitAmount,
    chainId: CHAIN_ID,
  });

  // push split transaction
  calls.push(splitFromRouter(router, parsedSplitAmount));

  // get quotes approvals
  // we can combine the buy quotes to get one approval for collateral
  const [buyQuotes, sellQuotes] = quotes.reduce(
    (acc, quote) => {
      acc[isTwoStringsEqual(quote.sellToken, collateral.address) ? 0 : 1].push(quote);
      return acc;
    },
    [[], []] as [UniswapQuoteTradeResult[], UniswapQuoteTradeResult[]]
  );
  const totalCollateralNeeded = buyQuotes.reduce(
    (acc, curr) => acc + getMaximumAmountIn(curr.trade),
    0n
  );

  const buyApprovalCalls = getApprovals7702({
    tokensAddresses: [buyQuotes[0].trade.executionPrice.baseCurrency.address as `0x${string}`],
    account,
    spender: buyQuotes[0].trade.approveAddress as `0x${string}`,
    amounts: totalCollateralNeeded,
    chainId: CHAIN_ID,
  });

  calls.push(...buyApprovalCalls);

  for (const { trade } of sellQuotes) {
    calls.push(...getTradeApprovals7702(account, trade));
  }

  // push trade transactions
  const tradeTransactions = await Promise.all(
    quotes.map(({ trade }) => getUniswapTradeExecution(trade, account))
  );
  calls.push(...tradeTransactions);

  const result = await toastifyTx(
    () =>
      sendCalls(config, {
        calls,
      }),
    {
      txSent: { title: "Executing trade..." },
      txSuccess: { title: "Trade executed!" },
    }
  );

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
    },
  });
};
