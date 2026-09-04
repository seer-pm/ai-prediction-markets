import { queryClient } from "@/config/queryClient";
import { toastifyBatchTxOwner, toastSuccess } from "@/lib/toastify";
import { getZcashNu7Quotes } from "@/lib/trade/getZcashNu7Quote";
import { CallBatchesInput, TxStateChange, ZcashNu7QuoteResult, ZcashNu7TradeProps } from "@/types";
import { CHAIN_ID, DECIMALS, ROUTER_ADDRESSES } from "@/utils/constants";
import { safeParseUnits } from "@/utils/format";
import { getQuoteTradeCalls } from "@/utils/trade";
import { allocateZcashNu7Budget } from "@/utils/zcashNu7Budget";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";
import { splitFromRouter } from "./useExecuteL2Strategy";
import { useTxProgress } from "./useTxProgress";

/**
 * Batch size, and the tripwire on the signing choice below.
 *
 * Worst case for this contest is five markets, nineteen substantive outcomes all actionable, and
 * every market minting. `getQuoteTradeCalls` emits two calls per leg (one approve, one swap) and
 * `splitFromRouter` two per mint, so `19 * 2 + 5 * 2 = 48` — one batch, with 2x headroom.
 *
 * If the ballot ever widens far enough to push this past roughly two batches, revisit
 * `toastifyBatchTxOwner` below: at N batches the owner path costs N wallet prompts, while the
 * session key's overhead stays flat at three regardless of N.
 */
const BATCH_SIZE = 100;

/**
 * Build the calls for one run.
 *
 * The split is emitted **per market**. There is no single global mint the way L1 and Octant do it:
 * each NU7 question is its own top-level market collateralized in sUSDS, so minting in one does
 * nothing for the other four. Ordering across markets is safe — Q1 mints its slice and trades, then
 * Q2 does — because the slices sum to at most the amount the dialog already validated against the
 * wallet's balance.
 */
const getTradeExecutorCalls = ({
  quoteResults,
  tradeExecutor,
}: {
  tradeExecutor: Address;
  quoteResults: ZcashNu7QuoteResult[];
}) => {
  const router = ROUTER_ADDRESSES[CHAIN_ID];

  return quoteResults
    .map(({ quotes, row, mintAmount }) => {
      const tradeCalls = getQuoteTradeCalls(tradeExecutor, quotes);
      const mintValue = safeParseUnits(mintAmount ?? "0", DECIMALS);
      // Skip a wasted splitPosition(0) on a question that only buys, or sells purely from balance.
      if (mintValue <= 0n) {
        return tradeCalls;
      }
      return [
        ...splitFromRouter(router, mintValue, row.marketId, row.collateralToken),
        ...tradeCalls,
      ];
    })
    .flat();
};

/**
 * Execute a NU7 predictions file in one pass.
 *
 * **One pass, not two.** `useExecuteZcashStrategy` runs a separate pre-sale batch so its proceeds are
 * real before the budget is divided across *37* markets; across five that recycles very little, and
 * the `sellTokenMapping` / `settledTableData` re-derivation it needs is the most error-prone part of
 * that hook. Here the planner already folds held balance into each sell leg
 * (`sell_i = min(v_i, b_i + m)`), and the quote layer already replaces the estimated proceeds with
 * real quoted output before sizing the buys. So: allocate, quote, build, send.
 *
 * **Owner-signed, not the session key.** At 48 calls this is a single batch, which costs one wallet
 * prompt and one transaction through `toastifyBatchTxOwner`. The session-key path would cost three
 * prompts and four transactions — authorise a throwaway key, fund its gas, execute, sweep the dust
 * back — no matter how small the run. That overhead pays for itself only when a run is many batches,
 * because those then cost no *additional* prompts; that is the 74-sell grants set, not this. It is
 * the same reasoning already written into `useSellAllZcashNu7`, which already puts 38 calls through
 * this exact path in production.
 */
const executeZcashNu7Strategy = async ({
  amount,
  tableData,
  tradeExecutor,
  onStateChange,
}: ZcashNu7TradeProps & { onStateChange: TxStateChange }) => {
  if (!tableData?.length) {
    throw new Error("No prediction data");
  }

  onStateChange({ phase: "requote", label: "Pricing the questions you predicted" });

  // Divide the mint amount equally across the questions that still have a move to make.
  const allocated = allocateZcashNu7Budget({ tableData, amount });

  const quoteResults = await getZcashNu7Quotes({ account: tradeExecutor, tableData: allocated });
  if (!quoteResults.length) {
    throw new Error("No quote found");
  }

  const calls = getTradeExecutorCalls({ quoteResults, tradeExecutor });
  if (!calls.length) {
    throw new Error("No quote found");
  }

  // What this run actually contains, so the ledger can report the stages it really walked through.
  // `RunLedger` marks every listed phase done on success, so a stage with nothing in it has to say
  // so explicitly — otherwise a pure-buy run ticks "Mint complete sets" as work performed.
  const hasMint = quoteResults.some(
    (result) => safeParseUnits(result.mintAmount ?? "0", DECIMALS) > 0n,
  );
  const hasSells = quoteResults.some((result) => result.quoteType !== "buy");
  const hasBuys = quoteResults.some((result) => result.quoteType !== "sell");

  const present: Record<"mint" | "sell" | "buy", boolean> = {
    mint: hasMint,
    sell: hasSells,
    buy: hasBuys,
  };
  const ORDER = ["mint", "sell", "buy"] as const;
  // Everything happens in one batch, so it is filed under the earliest stage it contains and the
  // others are reported as skipped — before the batch for the stages that precede it, after for the
  // ones that follow, so the ledger only ever moves forwards.
  const batchPhase = ORDER.find((phase) => present[phase]) ?? "sell";
  const batchIndex = ORDER.indexOf(batchPhase);

  const skip = (phase: (typeof ORDER)[number]) =>
    onStateChange({
      phase,
      skipped: true,
      label:
        phase === "mint"
          ? "No question needed complete sets minting."
          : phase === "sell"
            ? "Nothing you predicted trades above your number."
            : "Nothing you predicted trades below your number.",
    });

  ORDER.filter((phase, index) => index < batchIndex && !present[phase]).forEach(skip);

  const input: CallBatchesInput = [];
  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    input.push({
      calls: calls.slice(i, i + BATCH_SIZE),
      message: hasMint
        ? "Minting sets and trading to your predictions"
        : "Trading to your predictions",
      phase: batchPhase,
      // One withdrawn pool or one stale quote must not cost the user the other eighteen legs. The
      // pruning stays self-consistent across the mint/sell dependency because `buildExecutableBatch`
      // simulates cumulatively: drop a `splitPosition` and the sells that needed its tokens revert in
      // simulation and are dropped in the same pass.
      //
      // The residual case is a split that executes while its sell is pruned, leaving complete sets in
      // the wallet. That is capital parked, not lost — a set redeems for exactly 1 — and "Sell all
      // positions" clears the tradable part of it. Deliberately no unwind phase: unlike L2 and Octant
      // there is no single parent set here, so an unwind would be five separate `mergePositions`, each
      // needing one of *every* outcome, which after any successful sell is zero.
      skipFailCalls: true,
    });
  }

  const result = await toastifyBatchTxOwner(tradeExecutor, input, onStateChange);
  if (!result.status) {
    throw result.error;
  }

  ORDER.filter((phase, index) => index > batchIndex && !present[phase]).forEach(skip);

  onStateChange({ phase: "settle", label: "Refreshing your positions" });
  toastSuccess({ title: "Strategy executed" });
  return result;
};

/**
 * The pools and balances the run just moved. Delayed because the read goes through the same RPC
 * that has only just seen the block, and the pool price additionally has to round-trip the Uniswap
 * subgraph.
 */
const refreshAfterRun = () => {
  setTimeout(() => {
    queryClient.refetchQueries({ queryKey: ["fetchZcashNu7MarketsData"] });
    queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
    queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
  }, 3000);
};

export const useExecuteZcashNu7Strategy = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: ZcashNu7TradeProps) =>
      executeZcashNu7Strategy({ ...props, onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      refreshAfterRun();
    },
    // A reverted or partially pruned run can still have moved pools, so the refresh is not
    // conditional on success.
    onError() {
      refreshAfterRun();
    },
  });
  return { ...mutation, progress };
};
