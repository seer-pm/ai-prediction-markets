import { QuoteTradeFn, UniswapQuoteTradeResult, Token, QuoteProps, TableData } from "@/types";
import { isTwoStringsEqual } from "@/utils/common";
import { CHAIN_ID, collateral, DECIMALS, NATIVE_TOKEN } from "@/utils/constants";
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

  const maximumSlippage = new Percent("1", "100");

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

const VOLUME_MIN = 0.01;
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
    const volume =
      parseUnits(row.volumeUntilPrice.toString(), DECIMALS) > parseUnits(amount, DECIMALS)
        ? amount
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
        { address: row.marketId as Address, symbol: row.repo, decimals: 18 },
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

  const sellQuoteResults = await Promise.allSettled(sellPromises);
  const sellQuotes = sellQuoteResults.reduce((quotes, result) => {
    if (result.status === "fulfilled") {
      quotes.push(result.value);
    }
    return quotes;
  }, [] as UniswapQuoteTradeResult[]);

  // get total collateral from sell
  const totalCollateral = Number(
    formatUnits(
      sellQuotes.reduce((acc, curr) => acc + curr.value, 0n),
      DECIMALS
    )
  );

  if (!totalCollateral) {
    throw new Error(`Quote Error: Cannot sell to ${collateral.symbol}`);
  }

  // get buy quotes
  const sumBuyDifference = buyMarkets.reduce((acc, curr) => acc + curr.difference!, 0);
  const buyPromises = buyMarkets.reduce((promises, row) => {
    const volume = Math.min(
      row.volumeUntilPrice,
      (row.difference! / sumBuyDifference) * totalCollateral
    );
    if (volume < VOLUME_MIN) {
      return promises;
    }
    // get quote
    promises.push(
      getUniswapQuote(
        chainId,
        account,
        volume.toString(),
        { address: row.marketId as Address, symbol: row.repo, decimals: 18 },
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
  return [...sellQuotes, ...buyQuotes];
};
