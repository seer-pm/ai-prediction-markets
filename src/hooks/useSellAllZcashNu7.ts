import { queryClient } from "@/config/queryClient";
import { toastifyBatchTxOwner } from "@/lib/toastify";
import { getUniswapQuote } from "@/lib/trade/getQuote";
import { CallBatchesInput, TxStateChange, UniswapQuoteTradeResult } from "@/types";
import { CHAIN_ID, DECIMALS, collateral } from "@/utils/constants";
import { getQuoteTradeCalls } from "@/utils/trade";
import { useMutation } from "@tanstack/react-query";
import { Address, formatUnits } from "viem";
import { useTxProgress } from "./useTxProgress";

export interface SellAllNu7Position {
  outcomeToken: Address;
  outcomeSymbol: string;
  collateralToken: Address;
  balance: bigint;
  /** True for the Invalid outcome, which has no pool and can only be redeemed. */
  tradable: boolean;
}

interface SellAllProps {
  tradeExecutor: Address;
  positions: SellAllNu7Position[];
}

/**
 * Liquidate every tradable outcome token on the NU7 tab.
 *
 * At most 19 sells across 5 markets, so unlike the grants set's 74 this fits comfortably in one
 * batch and needs no chunking. Owner-signed because one wallet prompt beats the session key's
 * authorise/fund/execute/refund round trip, which only pays for itself over many batches.
 *
 * Invalid is skipped — it has no pool, so a quote for it would only throw. It is reachable through
 * redeem once the market settles.
 */
async function sellAllZcashNu7({
  tradeExecutor,
  positions,
  onStateChange,
}: SellAllProps & { onStateChange: TxStateChange }) {
  onStateChange({ phase: "requote", label: "Pricing your positions" });

  const sellable = positions.filter((position) => position.tradable && position.balance > 0n);
  if (!sellable.length) {
    throw new Error("You hold no tradable outcome tokens here.");
  }

  const results = await Promise.allSettled(
    sellable.map((position) =>
      getUniswapQuote(
        CHAIN_ID,
        tradeExecutor,
        formatUnits(position.balance, DECIMALS),
        { address: position.outcomeToken, symbol: position.outcomeSymbol, decimals: DECIMALS },
        { address: position.collateralToken, symbol: collateral.symbol, decimals: DECIMALS },
        "sell",
      ),
    ),
  );

  // One outcome whose pool has been withdrawn must not sink the other eighteen.
  const quotes = results.reduce((acc, result) => {
    if (result.status === "fulfilled") acc.push(result.value);
    return acc;
  }, [] as UniswapQuoteTradeResult[]);

  if (!quotes.length) {
    throw new Error("No sell route is available for the positions you hold.");
  }

  const input: CallBatchesInput = [
    {
      calls: getQuoteTradeCalls(tradeExecutor, quotes),
      message: "Swapping outcome tokens back to sUSDS",
      phase: "sell",
      // Unlike a single trade, one stale leg here should not cost the user the whole liquidation.
      skipFailCalls: true,
    },
  ];

  const result = await toastifyBatchTxOwner(tradeExecutor, input, onStateChange);
  if (!result.status) {
    throw result.error;
  }
  return result;
}

export const useSellAllZcashNu7 = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: SellAllProps) =>
      sellAllZcashNu7({ ...props, onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ["fetchZcashNu7MarketsData"] });
        queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
        queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
      }, 3000);
    },
  });
  return { ...mutation, progress };
};
