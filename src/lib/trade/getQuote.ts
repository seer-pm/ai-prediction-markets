import {
  QuoteTradeFn,
  UniswapQuoteTradeResult,
  Token,
  QuoteProps,
  TableData,
  OriginalityQuoteProps,
  OriginalityTableData,
} from "@/types";
import { isTwoStringsEqual, minBigIntArray } from "@/utils/common";
import {
  CHAIN_ID,
  collateral,
  DECIMALS,
  NATIVE_TOKEN,
  OTHER_TOKEN_ID,
  VOLUME_MIN,
} from "@/utils/constants";
import {
  Currency,
  CurrencyAmount,
  Percent,
  UniswapTrade,
  Token as SwaprToken,
  TokenAmount,
  TradeType,
} from "@swapr/sdk";
import { Address, formatUnits, parseUnits, zeroAddress } from "viem";

function getCurrenciesFromTokens(
  chainId: number,
  buyToken: Token,
  sellToken: Token,
  amount: string
): {
  currencyIn: Currency;
  currencyOut: Currency;
  currencyAmountIn: CurrencyAmount;
} {
  let currencyIn: Currency;
  let currencyAmountIn: CurrencyAmount;
  if (isTwoStringsEqual(sellToken.address, NATIVE_TOKEN)) {
    currencyIn = SwaprToken.getNative(chainId);
    currencyAmountIn = CurrencyAmount.nativeCurrency(
      parseUnits(String(amount), currencyIn.decimals),
      chainId
    );
  } else {
    const tokenIn = new SwaprToken(
      chainId,
      sellToken.address,
      sellToken.decimals,
      sellToken.symbol
    );
    currencyAmountIn = new TokenAmount(tokenIn, parseUnits(String(amount), tokenIn.decimals));
    currencyIn = tokenIn;
  }

  let currencyOut: Currency;
  if (isTwoStringsEqual(buyToken.address, NATIVE_TOKEN)) {
    currencyOut = SwaprToken.getNative(chainId);
  } else {
    currencyOut = new SwaprToken(chainId, buyToken.address, buyToken.decimals, buyToken.symbol);
  }

  return {
    currencyIn,
    currencyOut,
    currencyAmountIn,
  };
}

async function getTradeArgs(
  chainId: number,
  amount: string,
  outcomeToken: Token,
  collateralToken: Token,
  swapType: "buy" | "sell"
) {
  const [buyToken, sellToken] =
    swapType === "buy"
      ? [outcomeToken, collateralToken]
      : ([collateralToken, outcomeToken] as [Token, Token]);

  const sellAmount = parseUnits(String(amount), sellToken.decimals);

  const { currencyIn, currencyOut, currencyAmountIn } = getCurrenciesFromTokens(
    chainId,
    buyToken,
    sellToken,
    amount
  );

  const maximumSlippage = new Percent("5", "1000");

  return {
    buyToken,
    sellToken,
    sellAmount,
    currencyIn,
    currencyOut,
    currencyAmountIn,
    maximumSlippage,
  };
}

export const getUniswapQuote: QuoteTradeFn = async (
  chainId: number,
  account: Address | undefined,
  amount: string,
  outcomeToken: Token,
  collateralToken: Token,
  swapType: "buy" | "sell"
) => {
  const { currencyAmountIn, currencyOut, maximumSlippage, sellAmount, sellToken, buyToken } =
    await getTradeArgs(chainId, amount, outcomeToken, collateralToken, swapType);

  const trade = await UniswapTrade.getQuote({
    amount: currencyAmountIn,
    quoteCurrency: currencyOut,
    maximumSlippage,
    recipient: account || zeroAddress,
    tradeType: TradeType.EXACT_INPUT,
  });

  if (!trade) {
    throw new Error("No route found");
  }

  return {
    value: BigInt(trade.outputAmount.raw.toString()),
    decimals: sellToken.decimals,
    trade,
    buyToken: buyToken.address,
    sellToken: sellToken.address,
    sellAmount: sellAmount.toString(),
    swapType,
  };
};

type ProgressCallback = (current: number) => void;
export const getQuotes = async ({
  account,
  amount,
  tableData,
  onProgress,
}: QuoteProps & { onProgress?: ProgressCallback }) => {
  const chainId = CHAIN_ID;
  let currentProgress = 0;
  const marketsWithData = tableData.filter((row) => row.hasPrediction && row.difference);

  const [buyMarkets, sellMarkets] = marketsWithData.reduce(
    (acc, curr) => {
      acc[curr.difference! > 0 ? 0 : 1].push(curr);
      return acc;
    },
    [[], []] as [TableData[], TableData[]]
  );
  //get sell quotes first
  const sellPromises = sellMarkets.reduce((promises, row) => {
    if (isTwoStringsEqual(row.outcomeId, OTHER_TOKEN_ID)) {
      return promises;
    }
    const availableSellVolume = parseUnits(amount, DECIMALS) + (row.balance ?? 0n);
    const volume =
      parseUnits(row.volumeUntilPrice.toString(), DECIMALS) > availableSellVolume
        ? formatUnits(availableSellVolume, DECIMALS)
        : row.volumeUntilPrice.toString();
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
        "sell"
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
        })
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

  const collateralFromSell = sellQuotes.reduce((acc, curr) => acc + BigInt(curr!.value), 0n);

  //get collateral from merge: we merge other tokens first, then we merge the rest
  const newOtherBalances = tableData
    .filter((row) => row.isOther)
    .map(
      (row) =>
        (row.balance ?? 0n) + parseUnits(amount, DECIMALS) - (sellTokenMapping[row.outcomeId] ?? 0n)
    );
  const otherTokensFromMergeOther = minBigIntArray(newOtherBalances);

  const newBalances = tableData
    .filter((row) => !row.isOther)
    .map((row) => {
      if (row.outcomeId === OTHER_TOKEN_ID) {
        return (row.balance ?? 0n) + otherTokensFromMergeOther;
      }
      return (
        (row.balance ?? 0n) + parseUnits(amount, DECIMALS) - (sellTokenMapping[row.outcomeId] ?? 0n)
      );
    });
  const collateralFromMerge = minBigIntArray(newBalances);

  const totalCollateral = collateralFromSell + collateralFromMerge;

  if (!totalCollateral) {
    throw new Error(`Quote Error: Cannot sell to ${collateral.symbol}`);
  }

  // get buy quotes
  const sumBuyDifference = buyMarkets.reduce((acc, curr) => acc + curr.difference!, 0);
  const buyPromises = buyMarkets.reduce((promises, row) => {
    const availableBuyVolume =
      (parseUnits(row.difference!.toString(), DECIMALS) * totalCollateral) /
      parseUnits(sumBuyDifference!.toString(), DECIMALS);
    const volume =
      parseUnits(row.volumeUntilPrice.toString(), DECIMALS) > availableBuyVolume
        ? formatUnits(availableBuyVolume, DECIMALS)
        : row.volumeUntilPrice.toString();
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
        row.difference! > 0 ? "buy" : "sell"
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
        })
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
    quotes: [...sellQuotes, ...buyQuotes],
    mergeAmount: collateralFromMerge,
    otherTokensFromMergeOther,
  };
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
  const chainId = CHAIN_ID;
  const availableBuyVolume = parseUnits(amount, DECIMALS);
  const volumeUntilPrice = row.upDifference > 0 ? row.volumeUntilUpPrice : row.volumeUntilDownPrice;
  const volume =
    parseUnits(volumeUntilPrice.toString(), DECIMALS) > availableBuyVolume
      ? formatUnits(availableBuyVolume, DECIMALS)
      : volumeUntilPrice.toString();
  if (Number(volume) < VOLUME_MIN) {
    return [];
  }
  const token = row.upDifference > 0 ? row.wrappedTokens[1] : row.wrappedTokens[0];
  const quoteResult = await getUniswapQuote(
    chainId,
    account,
    volume,
    { address: token, symbol: row.upDifference > 0 ? "UP" : "DOWN", decimals: DECIMALS },
    { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
    "buy"
  );
  return [quoteResult];
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
  const chainId = CHAIN_ID;
  const availableSellVolume = parseUnits(amount, DECIMALS);
  const volumeUntilPrice = row.upDifference < 0 ? row.volumeUntilUpPrice : row.volumeUntilDownPrice;
  const volume =
    parseUnits(volumeUntilPrice.toString(), DECIMALS) > availableSellVolume
      ? formatUnits(availableSellVolume, DECIMALS)
      : volumeUntilPrice.toString();
  if (Number(volume) < VOLUME_MIN) {
    return [];
  }
  const token = row.upDifference < 0 ? row.wrappedTokens[1] : row.wrappedTokens[0];
  // sell from token to collateral
  const sellQuote = await getUniswapQuote(
    chainId,
    account,
    volume,
    { address: token, symbol: row.upDifference > 0 ? "UP" : "DOWN", decimals: DECIMALS },
    { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
    "sell"
  );
  const collateralAmount = sellQuote.value;
  //use sell collateral to buy
  const quoteResults = await simpleBuyOriginalityQuotes({
    account,
    amount: formatUnits(collateralAmount, DECIMALS),
    row,
  });
  return [sellQuote, ...quoteResults];
};

const compareOriginalityQuotes = async ({
  account,
  row,
}: {
  account: Address;
  row: OriginalityTableData;
}) => {
  if (!row.amount) return;
  const amount = row.amount;
  const complexQuoteResults = await complexBuyOriginalityQuotes({ account, amount, row });
  const simpleQuoteResults = await simpleBuyOriginalityQuotes({ account, amount, row });
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

export const getSellFromBalanceQuotes = async ({
  account,
  tableData,
}: {
  account: Address;
  tableData: OriginalityTableData[];
}) => {
  const sellPromises = tableData.reduce((promises, row) => {
    if (!row.upDifference || !row.downDifference) return promises;
    const hasOvervaluedToken =
      (row.upDifference && row.upDifference < 0 && row.upBalance) ||
      (row.downDifference && row.downDifference < 0 && row.downBalance);
    if (!hasOvervaluedToken) return promises;
    const chainId = CHAIN_ID;
    const availableSellVolume = (row.upDifference < 0 ? row.upBalance : row.downBalance) ?? 0n;
    const volumeUntilPrice =
      row.upDifference < 0 ? row.volumeUntilUpPrice : row.volumeUntilDownPrice;
    const volume =
      parseUnits(volumeUntilPrice.toString(), DECIMALS) > availableSellVolume
        ? formatUnits(availableSellVolume, DECIMALS)
        : volumeUntilPrice.toString();
    if (Number(volume) < VOLUME_MIN) {
      return [];
    }
    const token = row.upDifference < 0 ? row.wrappedTokens[1] : row.wrappedTokens[0];
    // sell from token to collateral
    promises.push(
      getUniswapQuote(
        chainId,
        account,
        volume,
        { address: token, symbol: row.upDifference > 0 ? "UP" : "DOWN", decimals: DECIMALS },
        { address: row.collateralToken, symbol: row.repo, decimals: DECIMALS },
        "sell"
      )
    );
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
          "sell"
        )
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
          "sell"
        )
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
      })
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
    [] as {
      quoteType: string;
      quotes: UniswapQuoteTradeResult[];
      row: OriginalityTableData;
    }[]
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
          "sell"
        )
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
