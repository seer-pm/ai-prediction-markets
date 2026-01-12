import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { getApprovals7702 } from "@/lib/trade/getApprovals7702";
import { getSellAllQuotes } from "@/lib/trade/getQuote";
import { OriginalityTableData } from "@/types";
import { isTwoStringsEqual, minBigIntArray } from "@/utils/common";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  ORIGINALITY_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
} from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { Address, encodeFunctionData } from "viem";
import { getQuoteTradeCalls } from "./useExecuteOriginalityStrategy";
import { fetchTokensBalances } from "./useTokensBalances";
import { toastifyBatchTx } from "@/lib/toastify";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: OriginalityTableData[];
}

async function sellToCollateral({ tradeExecutor, tableData }: SellAllProps) {
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const sellAllQuotes = await getSellAllQuotes({
    account: tradeExecutor,
    tableData,
  });
  const swapCalls = await getQuoteTradeCalls(tradeExecutor, sellAllQuotes);
  const collateralTokens = tableData.map((x) => x.collateralToken);
  const balances = await fetchTokensBalances(
    tradeExecutor,
    tableData.map((x) => x.collateralToken)
  );

  const mergeAmount = minBigIntArray(
    balances.map((balance, index) => {
      const soldValue = sellAllQuotes
        .filter((data) => isTwoStringsEqual(data.buyToken, collateralTokens[index]))
        .reduce((acc, curr) => acc + curr.value, 0n);
      return balance + soldValue;
    })
  );
  if (mergeAmount > 0n) {
    swapCalls.push(
      ...tableData
        .map((data) =>
          getApprovals7702({
            tokensAddresses: [data.collateralToken],
            account: tradeExecutor,
            spender: router,
            amounts: mergeAmount,
            chainId: CHAIN_ID,
          })
        )
        .flat()
    );
    // need to approval INVALID too
    const INVALID = "0x2281bb55063b8d036e5077f5b654c9bb1b397a34";
    swapCalls.push(
      ...getApprovals7702({
        tokensAddresses: [INVALID],
        account: tradeExecutor,
        spender: router,
        amounts: mergeAmount,
        chainId: CHAIN_ID,
      })
    );
    swapCalls.push({
      to: router,
      value: 0n,
      data: encodeFunctionData({
        abi: RouterAbi,
        functionName: "mergePositions",
        args: [collateral.address, ORIGINALITY_PARENT_MARKET_ID, mergeAmount],
      }),
    });
  }
  const result = await toastifyBatchTx(tradeExecutor, swapCalls, {
    txSent: "Selling all tokens to sUSDS...",
    txSuccess: "Tokens sold!",
  });
  if (!result.status) {
    throw result.error;
  }
  return result;
}

export const useSellToCollateral = (onSuccess?: () => unknown) => {
  return useMutation({
    mutationFn: (props: SellAllProps) => sellToCollateral(props),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
};
