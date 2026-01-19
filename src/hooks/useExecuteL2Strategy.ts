import { erc20Abi } from "@/abis/erc20Abi";
import { RouterAbi } from "@/abis/RouterAbi";
import { queryClient } from "@/config/queryClient";
import { toastifyBatchTxSessionKey, toastSuccess } from "@/lib/toastify";
import { getUniswapTradeData } from "@/lib/trade/getQuote";
import { L2TradeProps } from "@/types";
import { isTwoStringsEqual, minBigIntArray } from "@/utils/common";
import {
  CHAIN_ID,
  COLLATERAL_TOKENS,
  DECIMALS,
  L2_PARENT_MARKET_ID,
  ROUTER_ADDRESSES,
  VOLUME_MIN,
} from "@/utils/constants";
import { l2MarketOutcomes, l2OutcomeTokens } from "@/utils/l2MarketOutcomes";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Address, encodeFunctionData, formatUnits, parseUnits } from "viem";
import { Execution } from "./useCheck7702Support";
import { fetchTokensBalances } from "./useTokensBalances";

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

function splitFromRouter(
  router: Address,
  amount: bigint,
  marketId: Address,
  token: Address,
): Execution[] {
  return [
    {
      to: token,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [router, amount],
      }),
    },
    {
      to: router,
      value: 0n,
      data: encodeFunctionData({
        abi: RouterAbi,
        functionName: "splitPosition",
        args: [collateral.address, marketId, amount],
      }),
    },
  ];
}

function mergeFromRouter(
  router: Address,
  amount: bigint,
  marketId: Address,
  tokens: Address[],
): Execution[] {
  return [
    ...tokens.map((token) => {
      return {
        to: token,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [router, amount],
        }),
      };
    }),
    {
      to: router,
      value: 0n,
      data: encodeFunctionData({
        abi: RouterAbi,
        functionName: "mergePositions",
        args: [collateral.address, marketId, amount],
      }),
    },
  ];
}

const mintTokens = async ({
  amount,
  tradeExecutor,
  tableData,
  onStateChange,
}: L2TradeProps & { onStateChange: (state: string) => void }) => {
  // mint l1
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const parsedSplitAmount = parseUnits(amount, collateral.decimals);
  const batchesOfCalls: Execution[][] = [];
  const messages: string[] = [];
  batchesOfCalls.push(
    splitFromRouter(router, parsedSplitAmount, L2_PARENT_MARKET_ID, collateral.address),
  );
  messages.push("Step 1/4: Minting parent tokens");
  // mint l2 markets
  const l2MarketsWithData = Array.from(
    new Set(
      tableData.filter((row) => row.hasPrediction && row.difference).map((row) => row.marketId),
    ),
  );
  for (let i = 0; i < l2MarketsWithData.length; i++) {
    const row = tableData.find((row) => isTwoStringsEqual(row.marketId, l2MarketsWithData[i]));
    if (!row) continue;
    const { marketId, collateralToken } = row;
    batchesOfCalls.push(
      splitFromRouter(router, parsedSplitAmount, marketId as Address, collateralToken as Address),
    );
    messages.push(`Step 1/4: Minting tokens for market ${i + 1}/${l2MarketsWithData.length}`);
  }
  const result = await toastifyBatchTxSessionKey(
    tradeExecutor,
    batchesOfCalls,
    messages,
    onStateChange,
  );
  if (!result.status) {
    throw result.error;
  }
  return result;
};

const executeTrades = async ({
  amount,
  tradeExecutor,
  tableData,
  onStateChange,
}: L2TradeProps & { onStateChange: (state: string) => void }) => {
  const BATCH_SIZE = 70;
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  // sell first
  const sellCalls = tableData
    .filter((row) => row.hasPrediction && row.difference! < 0)
    .reduce((calls, row) => {
      const availableSellVolume = parseUnits(amount, DECIMALS) + (row.balance ?? 0n);
      const volume =
        parseUnits(row.volumeUntilPrice.toString(), DECIMALS) > availableSellVolume
          ? formatUnits(availableSellVolume, DECIMALS)
          : row.volumeUntilPrice.toString();
      if (Number(volume) < VOLUME_MIN) {
        return calls;
      }
      calls.push(
        ...getUniswapTradeData(
          CHAIN_ID,
          tradeExecutor,
          volume,
          { address: row.outcomeId as Address, symbol: row.dependency, decimals: DECIMALS },
          { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
          "sell",
        ),
      );
      return calls;
    }, [] as Execution[]);
  if (!sellCalls.length) {
    throw new Error("No tokens to sell");
  }
  const batchesOfSellCalls = [];
  const sellMessages = [];
  for (let i = 0; i < sellCalls.length; i += BATCH_SIZE) {
    batchesOfSellCalls.push(sellCalls.slice(i, i + BATCH_SIZE));
    sellMessages.push(
      `Step 2/4: Selling tokens batch ${i / BATCH_SIZE + 1}/${Math.ceil(sellCalls.length / BATCH_SIZE)}`,
    );
  }
  const sellResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    batchesOfSellCalls,
    sellMessages,
    onStateChange,
    true,
  );
  if (!sellResult.status) {
    throw sellResult.error;
  }

  //get token balances
  const balances = await fetchTokensBalances(tradeExecutor, l2OutcomeTokens);
  const tokenToBalanceMapping = l2OutcomeTokens.reduce(
    (acc, curr, index) => {
      acc[curr.toLowerCase() as Address] = balances[index] ?? 0n;
      return acc;
    },
    {} as { [key: Address]: bigint },
  );

  // merge by market
  const l2MarketsWithData = Array.from(
    new Set(
      tableData.filter((row) => row.hasPrediction && row.difference).map((row) => row.marketId),
    ),
  );
  const mergeCalls = [];
  for (const marketId of l2MarketsWithData) {
    const marketRows = tableData.filter((row) => isTwoStringsEqual(row.marketId, marketId));
    const marketTokensBalances = marketRows.map(
      (row) => tokenToBalanceMapping[row.outcomeId.toLowerCase() as Address] ?? 0n,
    );
    const mergeAmount = minBigIntArray(marketTokensBalances);
    if (mergeAmount > 0n) {
      mergeCalls.push(
        ...mergeFromRouter(router, mergeAmount, marketId as Address, marketRows[0].wrappedTokens),
      );
    }
  }
  const batchesOfMergeCalls = [];
  const mergeMessages = [];
  for (let i = 0; i < mergeCalls.length; i += BATCH_SIZE) {
    batchesOfMergeCalls.push(mergeCalls.slice(i, i + BATCH_SIZE));
    mergeMessages.push(
      `Step 3/4: Merging tokens batch ${i / BATCH_SIZE + 1}/${Math.ceil(mergeCalls.length / BATCH_SIZE)}`,
    );
  }
  if (batchesOfMergeCalls.length) {
    const mergeResult = await toastifyBatchTxSessionKey(
      tradeExecutor,
      batchesOfMergeCalls,
      mergeMessages,
      onStateChange,
    );
    if (!mergeResult.status) {
      throw mergeResult.error;
    }
  }

  //get collateral balances
  const collateralBalances = await fetchTokensBalances(tradeExecutor, l2MarketOutcomes);
  const collateralTokenToBalanceMapping = l2MarketOutcomes.reduce(
    (acc, curr, index) => {
      acc[curr.toLowerCase() as Address] = collateralBalances[index] ?? 0n;
      return acc;
    },
    {} as { [key: Address]: bigint },
  );
  const buyCalls = [];
  for (const marketId of l2MarketsWithData) {
    const buyRows = tableData.filter(
      (row) =>
        row.hasPrediction && isTwoStringsEqual(row.marketId, marketId) && row.difference! > 0n,
    );
    const totalCollateral = collateralTokenToBalanceMapping[buyRows[0].collateralToken];
    const sumBuyDifference = buyRows.reduce((acc, curr) => acc + curr.difference!, 0);
    for (const row of buyRows) {
      const availableBuyVolume =
        (parseUnits(row.difference!.toFixed(15), DECIMALS) * totalCollateral) /
        parseUnits(sumBuyDifference!.toFixed(15), DECIMALS);
      const volume =
        parseUnits(row.volumeUntilPrice.toString(), DECIMALS) > availableBuyVolume
          ? formatUnits(availableBuyVolume, DECIMALS)
          : row.volumeUntilPrice.toString();
      if (Number(volume) < VOLUME_MIN) {
        continue;
      }
      buyCalls.push(
        ...getUniswapTradeData(
          CHAIN_ID,
          tradeExecutor,
          volume.toString(),
          { address: row.outcomeId as Address, symbol: row.dependency, decimals: DECIMALS },
          { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
          "buy",
        ),
      );
    }
  }
  if (!buyCalls.length) {
    throw new Error("No tokens to sell");
  }
  const batchesOfBuyCalls = [];
  const buyMessages = [];
  for (let i = 0; i < buyCalls.length; i += BATCH_SIZE) {
    batchesOfBuyCalls.push(buyCalls.slice(i, i + BATCH_SIZE));
    buyMessages.push(
      `Step 4/4: Buying tokens batch ${i / BATCH_SIZE + 1}/${Math.ceil(buyCalls.length / BATCH_SIZE)}`,
    );
  }
  const buyResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    batchesOfBuyCalls,
    buyMessages,
    onStateChange,
    true,
  );
  if (!buyResult.status) {
    throw buyResult.error;
  }
};

const executeL2StrategyContract = async ({
  amount,
  tradeExecutor,
  tableData,
  onStateChange,
}: L2TradeProps & { onStateChange: (state: string) => void }) => {
  const filteredTableData = tableData.filter((row) => row.hasPrediction && row.difference);
  if (!filteredTableData.length) {
    throw new Error("No token found");
  }
  await mintTokens({ amount, tradeExecutor, tableData, onStateChange });
  await executeTrades({ amount, tradeExecutor, tableData, onStateChange });
  toastSuccess({
    title: "Trade executed",
  });
};

export const useExecuteL2Strategy = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("");
  const mutation = useMutation({
    mutationFn: (tradeProps: L2TradeProps) =>
      executeL2StrategyContract({ ...tradeProps, onStateChange: setTxState }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["useL2MarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
        queryClient.invalidateQueries({ queryKey: ["useGetL2Quotes"] });
      }, 3000);
    },
  });
  return {
    ...mutation,
    txState,
  };
};
