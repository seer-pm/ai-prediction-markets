import { getUniswapQuote } from "@/lib/trade/getQuote";
import { L2QuoteProps, L2TableData, UniswapQuoteTradeResult } from "@/types";
import { isTwoStringsEqual, minBigIntArray } from "@/utils/common";
import { CHAIN_ID, DECIMALS, VOLUME_MIN } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { parseUnits, formatUnits, Address } from "viem";
import pLimit from "p-limit";

const limit = pLimit(20);
const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export const getL2Quotes = async ({ account, amount, tableData }: L2QuoteProps) => {
  const l2MarketsWithData = Array.from(
    new Set(
      tableData.filter((row) => row.hasPrediction && row.difference).map((row) => row.marketId),
    ),
  );

  const promises = [];
  for (const marketId of l2MarketsWithData) {
    promises.push(limit(() => getL2MarketQuotes({ account, amount, tableData, marketId })));
  }
  const marketsExecution = (await Promise.all(promises)).filter((x) => x) as {
    quotes: UniswapQuoteTradeResult[];
    mergeAmount: bigint;
  }[];
  return marketsExecution;
};

export const getL2MarketQuotes = async ({
  account,
  amount,
  tableData,
  marketId,
}: L2QuoteProps & { marketId: string }) => {
  const chainId = CHAIN_ID;
  const rowsWithData = tableData.filter(
    (row) => row.hasPrediction && row.difference && isTwoStringsEqual(row.marketId, marketId),
  );
  const [buyRows, sellRows] = rowsWithData.reduce(
    (acc, curr) => {
      acc[curr.difference! > 0 ? 0 : 1].push(curr);
      return acc;
    },
    [[], []] as [L2TableData[], L2TableData[]],
  );
  const sellPromises = sellRows.reduce((promises, row) => {
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
  const newBalances = tableData
    .filter((row) => isTwoStringsEqual(row.marketId, marketId))
    .map((row) => {
      return (
        (row.balance ?? 0n) +
        parseUnits(amount, DECIMALS) -
        (sellTokenMapping[row.outcomeId.toLowerCase()] ?? 0n)
      );
    });
  const collateralFromMerge = minBigIntArray(newBalances);
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
    quotes: [...sellQuotes, ...buyQuotes],
    mergeAmount: collateralFromMerge,
  };
};

export default async (req: Request) => {
  const { runId } = await req.json();
  try {
    const { data: run } = await supabase
      .from("l2_quote_runs")
      .select("input")
      .eq("id", runId)
      .single();

    const input = run!.input as L2QuoteProps;
    const data = await getL2Quotes(input);
    await supabase
      .from("l2_quote_runs")
      .update({
        status: "done",
        result: data,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (e) {
    await supabase
      .from("l2_quote_runs")
      .update({
        status: "error",
        error: e.message,
      })
      .eq("id", runId);
  }
};
