import { queryClient } from "@/config/queryClient";
import { toastifyBatchTxOwner } from "@/lib/toastify";
import { getUniswapQuote } from "@/lib/trade/getQuote";
import { TxStateChange, UniswapQuoteTradeResult } from "@/types";
import { CHAIN_ID, DECIMALS, collateral } from "@/utils/constants";
import { getQuoteTradeCalls } from "@/utils/trade";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";
import { useTxProgress } from "./useTxProgress";

/**
 * One outcome, one direction, one transaction.
 *
 * Every other trade path in this app is a *contest strategy*: a predictions CSV is diffed against
 * the market and dozens of legs are planned, sized and batched behind a session key. This is the
 * other shape — the user picked an outcome and an amount, and nothing needs planning.
 *
 * That is why this submits through `toastifyBatchTxOwner` rather than
 * `toastifyBatchTxSessionKey`. The session-key path authorises a key, sends a funding transaction,
 * batch-executes and then refunds the unused gas — four transactions, which is the right trade for
 * a 37-market run and absurd for a single swap. `TradeExecutor.batchExecute` accepts the immutable
 * owner directly, so an owner-signed call is one wallet prompt and one transaction.
 *
 * The trade still executes *from the trade executor*, not the EOA, so positions, the sUSDS balance
 * and PnL attribution all stay in the one wallet the rest of the app reads.
 */
export interface TradeOutcomeProps {
  tradeExecutor: Address;
  outcomeToken: Address;
  /** Only for the quote's symbol field, which is cosmetic — the pool is found by address. */
  outcomeSymbol: string;
  collateralToken: Address;
  /**
   * Decimal string. For a buy this is collateral spent; for a sell it is outcome tokens sold.
   * Both sides of every pool here are 18-decimal.
   */
  amount: string;
  side: "buy" | "sell";
}

/**
 * The quote for a prospective trade, used both for the dialog's preview and as the thing actually
 * executed. Exported so the dialog can price without duplicating the argument order.
 */
export const quoteOutcomeTrade = ({
  tradeExecutor,
  outcomeToken,
  outcomeSymbol,
  collateralToken,
  amount,
  side,
}: TradeOutcomeProps): Promise<UniswapQuoteTradeResult> =>
  getUniswapQuote(
    CHAIN_ID,
    tradeExecutor,
    amount,
    { address: outcomeToken, symbol: outcomeSymbol, decimals: DECIMALS },
    { address: collateralToken, symbol: collateral.symbol, decimals: DECIMALS },
    side,
  );

const tradeOutcome = async ({
  onStateChange,
  ...props
}: TradeOutcomeProps & { onStateChange: TxStateChange }) => {
  const quote = await quoteOutcomeTrade(props);

  const calls = getQuoteTradeCalls(props.tradeExecutor, [quote]);

  const result = await toastifyBatchTxOwner(
    props.tradeExecutor,
    [
      {
        calls,
        message: props.side === "buy" ? "Buying outcome tokens" : "Selling outcome tokens",
        // Deliberately false. With a single swap there is nothing to salvage by pruning, and a
        // silently-dropped call would present as a successful trade that did nothing.
        skipFailCalls: false,
      },
    ],
    onStateChange,
  );

  if (!result.status) {
    throw result.error;
  }
  return result;
};

/**
 * The pools and balances the trade just moved. Delayed because the read goes through the same RPC
 * that has only just seen the block, and the pool price additionally has to round-trip the Uniswap
 * subgraph — the same 3s `useExecuteZcashStrategy` settled on.
 */
const refreshAfterTrade = () => {
  setTimeout(() => {
    queryClient.refetchQueries({ queryKey: ["fetchZcashNu7MarketsData"] });
    queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
    queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
  }, 3000);
};

export const useTradeOutcome = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: TradeOutcomeProps) =>
      tradeOutcome({ ...props, onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      refreshAfterTrade();
    },
    // A reverted or rejected trade can still have moved the pool (a partial batch, or someone
    // else's trade in between), so the refresh is not conditional on success.
    onError() {
      refreshAfterTrade();
    },
  });
  return { ...mutation, progress };
};
