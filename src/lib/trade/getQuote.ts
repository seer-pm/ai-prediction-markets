import { UniswapRouterAbi } from "@/abis/UniswapRouterAbi";
import { erc20Abi } from "@/abis/erc20Abi";
import { fetchTokensBalances } from "@/hooks/useTokensBalances";
import {
  L2QuoteProps,
  L2TableData,
  OriginalityQuoteProps,
  OriginalityQuoteResult,
  OriginalityTableData,
  QuoteProps,
  QuoteTradeFn,
  TableData,
  Token,
  UniswapQuoteTradeResult,
} from "@/types";
import { isTwoStringsEqual, minBigIntArray } from "@/utils/common";
import {
  CHAIN_ID,
  collateral,
  DECIMALS,
  OTHER_TOKEN_ID,
  UNISWAP_ROUTER_ADDRESSES,
  VOLUME_MIN,
} from "@/utils/constants";
import { l2MarketOutcomes, l2OutcomeTokens } from "@/utils/l2MarketOutcomes";
import pLimit from "p-limit";
import { Address, encodeFunctionData, formatUnits, parseUnits, zeroAddress } from "viem";
import { getUniswapQuoteFast } from "./getQuoteFast";

export const getUniswapQuote: QuoteTradeFn = getUniswapQuoteFast;

export const getUniswapTradeData = (
  _chainId: number,
  account: Address | undefined,
  amount: string,
  outcomeToken: Token,
  collateralToken: Token,
  swapType: "buy" | "sell",
) => {
  const [tokenIn, tokenOut] =
    swapType === "buy"
      ? [collateralToken.address, outcomeToken.address]
      : [outcomeToken.address, collateralToken.address];
  return [
    {
      to: tokenIn,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [UNISWAP_ROUTER_ADDRESSES[CHAIN_ID], parseUnits(amount, DECIMALS)],
      }),
    },
    {
      to: UNISWAP_ROUTER_ADDRESSES[CHAIN_ID],
      value: 0n,
      data: encodeFunctionData({
        abi: UniswapRouterAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            fee: 10000,
            recipient: account || zeroAddress,
            amountIn: parseUnits(amount, DECIMALS),
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      }),
    },
  ];
};

type ProgressCallback = (current: number) => void;
export const getL1SellQuotes = async ({
  account,
  amount,
  tableData,
  onProgress,
}: QuoteProps & { onProgress?: ProgressCallback }) => {
  const chainId = CHAIN_ID;
  let currentProgress = 0;
  const marketsWithData = tableData.filter((row) => row.hasPrediction && row.difference);

  const sellMarkets = marketsWithData.filter((row) => row.difference! < 0);

  const sellPromises = sellMarkets.reduce((promises, row) => {
    if (isTwoStringsEqual(row.outcomeId, OTHER_TOKEN_ID)) {
      return promises;
    }
    const availableSellVolume = parseUnits(amount, DECIMALS) + (row.balance ?? 0n);
    const volume =
      parseUnits(row.volumeUntilPrice.toFixed(15), DECIMALS) > availableSellVolume
        ? formatUnits(availableSellVolume, DECIMALS)
        : row.volumeUntilPrice.toFixed(15);
    if (Number(volume) < VOLUME_MIN) {
      return promises;
    }
    // get quote
    promises.push(
      getUniswapQuote(
        chainId,
        account,
        volume,
        { address: row.outcomeId as Address, symbol: row.repo, decimals: DECIMALS },
        collateral,
        "sell",
      )
        .then((result) => {
          currentProgress++;
          onProgress?.(currentProgress);
          return result;
        })
        .catch((e) => {
          currentProgress++;
          onProgress?.(currentProgress);
          throw e;
        }),
    );
    return promises;
  }, [] as Promise<UniswapQuoteTradeResult>[]);

  if (!sellPromises.length) {
    throw new Error("Quote Error: No sell route found");
  }
  const sellTokenMapping: { [key: string]: bigint } = {};
  const sellQuoteResults = await Promise.allSettled(sellPromises);
  const sellQuotes = sellQuoteResults.reduce((quotes, result) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
      sellTokenMapping[result.value.sellToken.toLowerCase()] = BigInt(result.value.sellAmount);
    }
    return quotes;
  }, [] as UniswapQuoteTradeResult[]);
  if (!sellQuotes.length) {
    throw new Error("No quote found");
  }
  return {
    quotes: sellQuotes,
    mergeAmount: 0n,
    otherTokensFromMergeOther: 0n,
  };
};

export const getL1BuyQuotes = async ({
  account,
  amount: _,
  tableData,
  collateralFromSell,
  onProgress,
}: QuoteProps & { onProgress?: ProgressCallback; collateralFromSell: bigint }) => {
  const chainId = CHAIN_ID;
  let currentProgress = 0;
  const marketsWithData = tableData.filter((row) => row.hasPrediction && row.difference);
  const buyMarkets = marketsWithData.filter((row) => row.difference! > 0);

  //get collateral from merge: we merge other tokens first, then we merge the rest
  const otherBalances = await fetchTokensBalances(
    account,
    tableData.filter((row) => row.isOther).map((row) => row.outcomeId as Address),
  );

  const otherTokensFromMergeOther = minBigIntArray(otherBalances);

  const newBalances = await fetchTokensBalances(
    account,
    tableData.filter((row) => !row.isOther).map((row) => row.outcomeId as Address),
  );
  const collateralFromMerge = minBigIntArray([...newBalances, otherTokensFromMergeOther]);

  const totalCollateral = collateralFromSell + collateralFromMerge;

  if (!totalCollateral) {
    throw new Error(`Quote Error: Cannot sell to ${collateral.symbol}`);
  }

  // get buy quotes
  const sumBuyDifference = buyMarkets.reduce((acc, curr) => acc + curr.difference!, 0);
  const buyPromises = buyMarkets.reduce((promises, row) => {
    const availableBuyVolume =
      (parseUnits(row.difference!.toFixed(15), DECIMALS) * totalCollateral) /
      parseUnits(sumBuyDifference!.toFixed(15), DECIMALS);
    const volume =
      parseUnits(row.volumeUntilPrice.toFixed(15), DECIMALS) > availableBuyVolume
        ? formatUnits(availableBuyVolume, DECIMALS)
        : row.volumeUntilPrice.toFixed(15);
    if (Number(volume) < VOLUME_MIN) {
      return promises;
    }
    // get quote
    promises.push(
      getUniswapQuote(
        chainId,
        account,
        volume.toString(),
        { address: row.outcomeId as Address, symbol: row.repo, decimals: DECIMALS },
        collateral,
        row.difference! > 0 ? "buy" : "sell",
      )
        .then((result) => {
          currentProgress++;
          onProgress?.(currentProgress);
          return result;
        })
        .catch((e) => {
          currentProgress++;
          onProgress?.(currentProgress);
          throw e;
        }),
    );
    return promises;
  }, [] as Promise<UniswapQuoteTradeResult>[]);

  if (!buyPromises.length) {
    throw new Error("Quote Error: Amount too small");
  }
  const buyQuoteResult = await Promise.allSettled(buyPromises);
  const buyQuotes = buyQuoteResult.reduce((quotes, result) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
    }
    return quotes;
  }, [] as UniswapQuoteTradeResult[]);

  if (!buyQuotes) {
    throw new Error(`Quote Error: Cannot buy from ${collateral.symbol}`);
  }
  // sell first, then buy
  return {
    quotes: buyQuotes,
    mergeAmount: collateralFromMerge,
    otherTokensFromMergeOther,
  };
};

export const getL2MarketSellQuotes = async ({
  account,
  amount,
  tableData,
  marketId,
}: L2QuoteProps & { marketId: string }) => {
  const chainId = CHAIN_ID;
  const rowsWithData = tableData.filter(
    (row) => row.hasPrediction && row.difference && isTwoStringsEqual(row.marketId, marketId),
  );
  const sellRows = rowsWithData.filter((row) => row.difference! < 0);
  const sellPromises = sellRows.reduce((promises, row) => {
    const availableSellVolume = parseUnits(amount, DECIMALS) + (row.balance ?? 0n);
    const volume =
      parseUnits(row.volumeUntilPrice.toFixed(15), DECIMALS) > availableSellVolume
        ? formatUnits(availableSellVolume, DECIMALS)
        : row.volumeUntilPrice.toFixed(15);
    if (Number(volume) < VOLUME_MIN) {
      return promises;
    }
    // get quote
    promises.push(
      getUniswapQuote(
        chainId,
        account,
        volume,
        { address: row.outcomeId as Address, symbol: row.dependency, decimals: DECIMALS },
        { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
        "sell",
      ),
    );
    return promises;
  }, [] as Promise<UniswapQuoteTradeResult>[]);
  if (!sellPromises.length) {
    return null;
  }
  const sellQuoteResults = await Promise.allSettled(sellPromises);
  const sellQuotes = sellQuoteResults.reduce((quotes, result) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
    }
    return quotes;
  }, [] as UniswapQuoteTradeResult[]);
  return {
    quotes: [...sellQuotes],
    mergeAmount: 0n,
  };
};

export const getL2MarketBuyQuotes = async ({
  account,
  amount: _,
  tableData,
  marketId,
  tokensBalancesMapping,
  collateralsBalancesMapping,
}: L2QuoteProps & {
  marketId: string;
  tokensBalancesMapping: { [key: Address]: bigint };
  collateralsBalancesMapping: { [key: Address]: bigint };
}) => {
  const chainId = CHAIN_ID;
  const rowsWithData = tableData.filter(
    (row) => row.hasPrediction && row.difference && isTwoStringsEqual(row.marketId, marketId),
  );
  const buyRows = rowsWithData.filter((row) => row.difference! > 0);
  const marketRows = tableData.filter((row) => isTwoStringsEqual(row.marketId, marketId));
  if (!marketRows) return null;
  const collateralFromSell =
    collateralsBalancesMapping[marketRows[0].collateralToken.toLowerCase() as Address] ?? 0n;

  const collateralFromMerge = minBigIntArray(
    marketRows[0].wrappedTokens.map(
      (token) => tokensBalancesMapping[token.toLowerCase() as Address] ?? 0n,
    ),
  );
  const totalCollateral = collateralFromSell + collateralFromMerge;
  if (!totalCollateral) {
    return null;
  }
  // get buy quotes
  const sumBuyDifference = buyRows.reduce((acc, curr) => acc + curr.difference!, 0);
  const buyPromises = buyRows.reduce((promises, row) => {
    const availableBuyVolume =
      (parseUnits(row.difference!.toFixed(15), DECIMALS) * totalCollateral) /
      parseUnits(sumBuyDifference!.toFixed(15), DECIMALS);
    const volume =
      parseUnits(row.volumeUntilPrice.toFixed(15), DECIMALS) > availableBuyVolume
        ? formatUnits(availableBuyVolume, DECIMALS)
        : row.volumeUntilPrice.toFixed(15);
    if (Number(volume) < VOLUME_MIN) {
      return promises;
    }
    // get quote
    promises.push(
      getUniswapQuote(
        chainId,
        account,
        volume.toString(),
        { address: row.outcomeId as Address, symbol: row.dependency, decimals: DECIMALS },
        { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
        "buy",
      ),
    );
    return promises;
  }, [] as Promise<UniswapQuoteTradeResult>[]);

  if (!buyPromises.length) {
    return null;
  }
  const buyQuoteResult = await Promise.allSettled(buyPromises);
  const buyQuotes = buyQuoteResult.reduce((quotes, result) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
    }
    return quotes;
  }, [] as UniswapQuoteTradeResult[]);
  if (!buyQuotes) {
    return null;
  }
  return {
    quotes: [...buyQuotes],
    mergeAmount: collateralFromMerge,
  };
};

export const getL2BuyQuotes = async ({
  account,
  amount,
  tableData,
  onProgress,
}: L2QuoteProps & { onProgress?: ProgressCallback }) => {
  let currentProgress = 0;
  const l2MarketsWithData = Array.from(
    new Set(
      tableData.filter((row) => row.hasPrediction && row.difference).map((row) => row.marketId),
    ),
  );
  const balances = await fetchTokensBalances(account, l2OutcomeTokens);
  const tokensBalancesMapping = l2OutcomeTokens.reduce(
    (acc, curr, index) => {
      acc[curr.toLowerCase() as Address] = balances[index] ?? 0n;
      return acc;
    },
    {} as { [key: Address]: bigint },
  );
  const collateralBalances = await fetchTokensBalances(account, l2MarketOutcomes);
  const collateralsBalancesMapping = l2MarketOutcomes.reduce(
    (acc, curr, index) => {
      acc[curr.toLowerCase() as Address] = collateralBalances[index] ?? 0n;
      return acc;
    },
    {} as { [key: Address]: bigint },
  );
  const promises = [];
  const limit = pLimit(2);
  for (const marketId of l2MarketsWithData) {
    promises.push(
      limit(() => {
        currentProgress++;
        onProgress?.(currentProgress);
        return getL2MarketBuyQuotes({
          account,
          amount,
          tableData,
          marketId,
          tokensBalancesMapping,
          collateralsBalancesMapping,
        });
      }),
    );
  }
  const marketsExecution = (await Promise.all(promises)).filter((x) => x) as {
    quotes: UniswapQuoteTradeResult[];
    mergeAmount: bigint;
  }[];
  return marketsExecution;
};

export const getL2SellQuotes = async ({
  account,
  amount,
  tableData,
  onProgress,
}: L2QuoteProps & { onProgress?: ProgressCallback }) => {
  let currentProgress = 0;
  const l2MarketsWithData = Array.from(
    new Set(
      tableData.filter((row) => row.hasPrediction && row.difference).map((row) => row.marketId),
    ),
  );

  const promises = [];
  const limit = pLimit(2);
  for (const marketId of l2MarketsWithData) {
    promises.push(
      limit(() => {
        currentProgress++;
        onProgress?.(currentProgress);
        return getL2MarketSellQuotes({ account, amount, tableData, marketId });
      }),
    );
  }
  const marketsExecution = (await Promise.all(promises)).filter((x) => x) as {
    quotes: UniswapQuoteTradeResult[];
    mergeAmount: bigint;
  }[];
  if (!marketsExecution.length) {
    throw new Error("No quote found");
  }
  return marketsExecution;
};

type TradeSide = "UP" | "DOWN";
type TradeAction = "buy" | "sell";
const getBoundedOriginalityQuote = async ({
  account,
  row,
  amount,
  side,
  action,
}: {
  account: Address;
  row: OriginalityTableData;
  amount: string;
  side: TradeSide;
  action: TradeAction;
}) => {
  const chainId = CHAIN_ID;

  const tokenIndex = side === "UP" ? 1 : 0;
  const token = row.wrappedTokens[tokenIndex];

  const volumeUntilPrice = side === "UP" ? row.volumeUntilUpPrice : row.volumeUntilDownPrice;

  if (!volumeUntilPrice) return null;

  const availableVolume = parseUnits(amount, DECIMALS);

  const cappedVolume =
    parseUnits(volumeUntilPrice.toString(), DECIMALS) > availableVolume
      ? formatUnits(availableVolume, DECIMALS)
      : volumeUntilPrice.toString();

  if (Number(cappedVolume) < VOLUME_MIN) return null;

  return getUniswapQuote(
    chainId,
    account,
    cappedVolume,
    {
      address: token,
      symbol: side,
      decimals: DECIMALS,
    },
    {
      address: row.collateralToken,
      symbol: row.repo,
      decimals: DECIMALS,
    },
    action,
  );
};

const simpleBuyOriginalityQuotes = async ({
  account,
  amount,
  row,
}: {
  account: Address;
  amount: string;
  row: OriginalityTableData;
}) => {
  if (!row.upDifference || !row.downDifference) return [];

  const side = row.upDifference > 0 ? "UP" : "DOWN";

  const quote = await getBoundedOriginalityQuote({
    account,
    row,
    amount,
    side,
    action: "buy",
  });

  return quote ? [quote] : [];
};

const complexBuyOriginalityQuotes = async ({
  account,
  amount,
  row,
}: {
  account: Address;
  amount: string;
  row: OriginalityTableData;
}) => {
  if (!row.upDifference || !row.downDifference) return [];

  const sellSide = row.upDifference < 0 ? "UP" : "DOWN";

  // 1. sell overvalued side
  const sellQuote = await getBoundedOriginalityQuote({
    account,
    row,
    amount,
    side: sellSide,
    action: "sell",
  });

  if (!sellQuote) return [];

  // 2. use proceeds to buy undervalued
  const buyAmount = formatUnits(sellQuote.value, DECIMALS);

  const buySide = sellSide === "UP" ? "DOWN" : "UP";

  const buyQuote = await getBoundedOriginalityQuote({
    account,
    row,
    amount: buyAmount,
    side: buySide,
    action: "buy",
  });

  return buyQuote ? [sellQuote, buyQuote] : [sellQuote];
};

const dualBuyOriginalityQuotes = async ({
  account,
  amount,
  row,
}: {
  account: Address;
  amount: string;
  row: OriginalityTableData;
}) => {
  const half = formatUnits(parseUnits(amount, DECIMALS) / 2n, DECIMALS);

  const [up, down] = await Promise.all([
    getBoundedOriginalityQuote({ account, row, amount: half, side: "UP", action: "buy" }),
    getBoundedOriginalityQuote({ account, row, amount: half, side: "DOWN", action: "buy" }),
  ]);

  return [up, down].filter(Boolean) as UniswapQuoteTradeResult[];
};

const dualSellOriginalityQuotes = async ({
  account,
  amount,
  row,
}: {
  account: Address;
  amount: string;
  row: OriginalityTableData;
}) => {
  const [up, down] = await Promise.all([
    getBoundedOriginalityQuote({ account, row, amount, side: "UP", action: "sell" }),
    getBoundedOriginalityQuote({ account, row, amount, side: "DOWN", action: "sell" }),
  ]);

  return [up, down].filter(Boolean) as UniswapQuoteTradeResult[];
};

// UP+DOWN>1 arbitrage: mint a complete set and sell both sides until each pool
// reaches its proportional share of 1. Ignores the user's prediction. Existing
// token balances are sold first (free), so we only mint the symmetric remainder.
const arbSellOriginalityQuotes = async ({
  account,
  row,
}: {
  account: Address;
  row: OriginalityTableData;
}): Promise<OriginalityQuoteResult | null> => {
  const volUp = row.volumeUntilUpEqual;
  const volDown = row.volumeUntilDownEqual;

  // No headroom on either side to push the sum back toward 1.
  if (volUp < VOLUME_MIN && volDown < VOLUME_MIN) return null;

  const upBal = Number(formatUnits(row.upBalance ?? 0n, DECIMALS));
  const downBal = Number(formatUnits(row.downBalance ?? 0n, DECIMALS));
  const cap = Number(row.amount ?? "0"); // per-repo collateral available to mint

  // Mint only the symmetric headroom left after selling tokens already owned.
  const mintAmount = Math.max(0, Math.min(volUp - upBal, volDown - downBal, cap));

  // Each side sells owned + minted tokens, capped so we never overshoot sum<1.
  const sellUp = Math.min(volUp, upBal + mintAmount);
  const sellDown = Math.min(volDown, downBal + mintAmount);

  const [upToken, downToken] = [row.wrappedTokens[1], row.wrappedTokens[0]];
  const sellQuote = (token: Address, symbol: TradeSide, amount: number) =>
    amount < VOLUME_MIN
      ? Promise.resolve(null)
      : getUniswapQuote(
          CHAIN_ID,
          account,
          amount.toFixed(15),
          { address: token, symbol, decimals: DECIMALS },
          { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
          "sell",
        ).catch(() => null);

  const [upSell, downSell] = await Promise.all([
    sellQuote(upToken, "UP", sellUp),
    sellQuote(downToken, "DOWN", sellDown),
  ]);

  const quotes = [upSell, downSell].filter(Boolean) as UniswapQuoteTradeResult[];
  if (!quotes.length) return null;

  return {
    quoteType: "arb-sell",
    quotes,
    row,
    mintAmount: mintAmount.toFixed(15),
  };
};

const compareOriginalityQuotes = async ({
  account,
  row,
}: {
  account: Address;
  row: OriginalityTableData;
}): Promise<OriginalityQuoteResult | undefined> => {
  if (!row.amount) return;
  const amount = row.amount;
  // UP+DOWN>1 arbitrage takes priority and ignores the prediction.
  const arbQuote = await arbSellOriginalityQuotes({ account, row });
  if (arbQuote) return arbQuote;
  if (!row.upDifference || !row.downDifference) return;
  // check if both are overvalued or undervalued
  const isUpUndervalued = row.upDifference > 0;
  const isDownUndervalued = row.downDifference > 0;
  const isUpOvervalued = row.upDifference < 0;
  const isDownOvervalued = row.downDifference < 0;
  if (isUpUndervalued && isDownUndervalued) {
    const quotes = await dualBuyOriginalityQuotes({ account, amount, row });
    return {
      quoteType: "dual-buy",
      quotes,
      row,
    };
  }
  if (isUpOvervalued && isDownOvervalued) {
    const quotes = await dualSellOriginalityQuotes({ account, amount, row });
    return {
      quoteType: "dual-sell",
      quotes,
      row,
    };
  }
  const [complexQuoteResults, simpleQuoteResults] = await Promise.all([
    complexBuyOriginalityQuotes({ account, amount, row }),
    simpleBuyOriginalityQuotes({ account, amount, row }),
  ]);
  const complexBuyQuote = complexQuoteResults[1];
  const simpleBuyQuote = simpleQuoteResults[0];
  if (!simpleBuyQuote && !complexBuyQuote) return;
  const isUseSimple =
    simpleBuyQuote &&
    simpleBuyQuote.value > (complexBuyQuote?.value ?? 0n) + parseUnits(amount, DECIMALS);
  return isUseSimple
    ? {
        quoteType: "simple",
        quotes: simpleQuoteResults,
        row,
      }
    : {
        quoteType: "complex",
        quotes: complexQuoteResults,
        row,
      };
};

const getSellFromBalanceForSide = async ({
  account,
  row,
  side,
}: {
  account: Address;
  row: OriginalityTableData;
  side: "UP" | "DOWN";
}) => {
  const isOvervalued =
    side === "UP"
      ? row.upDifference && row.upDifference < 0
      : row.downDifference && row.downDifference < 0;

  if (!isOvervalued) return null;

  const balance = side === "UP" ? (row.upBalance ?? 0n) : (row.downBalance ?? 0n);

  if (!balance || balance === 0n) return null;

  const amount = formatUnits(balance, DECIMALS);

  return getBoundedOriginalityQuote({
    account,
    row,
    amount,
    side,
    action: "sell",
  });
};

export const getSellFromBalanceQuotes = async ({
  account,
  tableData,
}: {
  account: Address;
  tableData: OriginalityTableData[];
}) => {
  const promises: Promise<UniswapQuoteTradeResult | null>[] = [];

  for (const row of tableData) {
    if (!row.upDifference || !row.downDifference) continue;

    promises.push(
      getSellFromBalanceForSide({ account, row, side: "UP" }),
      getSellFromBalanceForSide({ account, row, side: "DOWN" }),
    );
  }

  const results = await Promise.allSettled(promises);

  return results
    .filter(
      (r): r is PromiseFulfilledResult<UniswapQuoteTradeResult | null> =>
        r.status === "fulfilled" && !!r.value,
    )
    .map((r) => r.value as UniswapQuoteTradeResult);
};

export const getSellAllQuotes = async ({
  account,
  tableData,
}: {
  account: Address;
  tableData: OriginalityTableData[];
}) => {
  const chainId = CHAIN_ID;
  const sellPromises = tableData.reduce((promises, row) => {
    // sell from token to collateral
    if (row.upBalance) {
      promises.push(
        getUniswapQuote(
          chainId,
          account,
          formatUnits(row.upBalance, DECIMALS),
          { address: row.wrappedTokens[1], symbol: "UP", decimals: DECIMALS },
          { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
          "sell",
        ),
      );
    }
    if (row.downBalance) {
      promises.push(
        getUniswapQuote(
          chainId,
          account,
          formatUnits(row.downBalance, DECIMALS),
          { address: row.wrappedTokens[0], symbol: "DOWN", decimals: DECIMALS },
          { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
          "sell",
        ),
      );
    }
    return promises;
  }, [] as Promise<UniswapQuoteTradeResult>[]);

  const sellQuoteResults = await Promise.allSettled(sellPromises);
  const sellQuotes = sellQuoteResults.reduce((quotes, result) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
    }
    return quotes;
  }, [] as UniswapQuoteTradeResult[]);

  return sellQuotes;
};

export const getOriginalityQuotes = async ({
  account,
  tableData,
  onProgress,
}: OriginalityQuoteProps & { onProgress?: ProgressCallback }) => {
  let currentProgress = 0;
  const quotePromises = tableData.map((row) =>
    compareOriginalityQuotes({ account, row })
      .then((result) => {
        currentProgress++;
        onProgress?.(currentProgress);
        return result;
      })
      .catch((e) => {
        currentProgress++;
        onProgress?.(currentProgress);
        throw e;
      }),
  );
  if (!quotePromises.length) {
    throw new Error("Quote Error: Amount too small");
  }
  const quoteResults = await Promise.allSettled(quotePromises);
  const quotes = quoteResults.reduce(
    (quotes, result) => {
      if (result.status === "fulfilled" && result.value) {
        quotes.push(result.value);
      }
      return quotes;
    },
    [] as OriginalityQuoteResult[],
  );

  if (!quotes) {
    throw new Error("Quote Error: Cannot execute strategy");
  }
  return quotes;
};

export const getSellAllL1Quotes = async ({
  account,
  tableData,
}: {
  account: Address;
  tableData: TableData[];
}) => {
  const chainId = CHAIN_ID;
  const sellPromises = tableData.reduce((promises, row) => {
    if (isTwoStringsEqual(row.outcomeId, OTHER_TOKEN_ID)) {
      return promises;
    }
    // sell from token to collateral
    if (row.balance) {
      promises.push(
        getUniswapQuote(
          chainId,
          account,
          formatUnits(row.balance, DECIMALS),
          { address: row.outcomeId as Address, symbol: row.repo, decimals: DECIMALS },
          collateral,
          "sell",
        ),
      );
    }

    return promises;
  }, [] as Promise<UniswapQuoteTradeResult>[]);

  const sellQuoteResults = await Promise.allSettled(sellPromises);
  const sellQuotes = sellQuoteResults.reduce((quotes, result) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
    }
    return quotes;
  }, [] as UniswapQuoteTradeResult[]);

  return sellQuotes;
};

export const getSellAllL2Quotes = async ({
  account,
  tableData,
  onStateChange,
}: {
  account: Address;
  tableData: L2TableData[];
  onStateChange: (state: string) => void;
}) => {
  const chainId = CHAIN_ID;
  const limit = pLimit(50);
  let currentQuote = 0;
  const totalQuotes = tableData.filter((x) => x.balance).length;
  onStateChange(`Getting quotes ${currentQuote}/${totalQuotes}`);
  const sellPromises = tableData.reduce((promises, row) => {
    // sell from token to collateral
    if (row.balance) {
      promises.push(
        limit(() =>
          getUniswapQuote(
            chainId,
            account,
            formatUnits(row.balance!, DECIMALS),
            { address: row.outcomeId as Address, symbol: row.dependency, decimals: DECIMALS },
            { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
            "sell",
          )
            .then((result) => {
              currentQuote++;
              onStateChange(`Getting quotes ${currentQuote}/${totalQuotes}`);
              return result;
            })
            .catch((e) => {
              currentQuote++;
              onStateChange(`Getting quotes ${currentQuote}/${totalQuotes}`);
              throw e;
            }),
        ),
      );
    }

    return promises;
  }, [] as Promise<UniswapQuoteTradeResult>[]);

  const sellQuoteResults = await Promise.allSettled(sellPromises);
  const sellQuotes = sellQuoteResults.reduce((quotes, result) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
    }
    return quotes;
  }, [] as UniswapQuoteTradeResult[]);

  return sellQuotes;
};
