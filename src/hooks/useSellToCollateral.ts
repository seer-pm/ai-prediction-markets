import { queryClient, TRADE_RUN_MUTATION_KEY } from "@/config/queryClient";
import { withdrawFundSessionKey, withRunLock } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey, waitForSentBlock } from "@/lib/toastify";
import { getSellAllQuotes } from "@/lib/trade/getQuote";
import { CallBatchesInput, OriginalityTableData, TxStateChange } from "@/types";
import { minBigIntArray } from "@/utils/common";
import { CHAIN_ID, ROUTER_ADDRESSES } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { useTxProgress } from "./useTxProgress";
import { Address } from "viem";
import { mergeFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalancesOrThrow } from "./useTokensBalances";
import { depositToTradeExecutor } from "./useDepositToTradeExecutor";
import { TradeError } from "@/utils/errors";
import { getQuoteTradeCalls } from "@/utils/trade";
import { CompleteSetMerge, planCompleteSetMerges } from "@/utils/completeSets";
import { OriginalityMiddleMarket } from "@/utils/originalityRounds";

interface SellAllProps {
  tradeExecutor: Address;
  tableData: OriginalityTableData[];
  parentMarketId: Address;
  /** The parent's Invalid outcome token — a complete set includes it. */
  parentInvalidToken: Address;
  /**
   * Markets between the parent and the repo markets. Selling returns each repo's own token, which
   * only becomes a parent outcome token again by merging its middle market.
   */
  middleMarkets?: readonly OriginalityMiddleMarket[];
  /**
   * Outcome tokens of this contest that may sit in the user's own wallet rather than the trade
   * wallet — moved there by the "Withdraw tokens" button this app had until 2026-11-03. Whatever
   * of them is held is moved back first, so the run below can merge and sell it.
   */
  ownWallet?: { account: Address; tokens: Address[]; use7702: boolean };
}

/**
 * Moves what the user's own wallet holds of `tokens` back into the trade wallet. Amounts are read
 * now, not taken from the dialog: a transfer sized from a stale balance reverts — the reason a
 * user's second "Withdraw tokens" click failed on 2026-10-31. Reading fresh also makes a stopped
 * run resumable: the next one moves only what is still there.
 */
async function returnFromOwnWallet(
  tradeExecutor: Address,
  { account, tokens, use7702 }: NonNullable<SellAllProps["ownWallet"]>,
  onStateChange: TxStateChange,
) {
  let held: bigint[];
  try {
    held = await fetchTokensBalancesOrThrow(account, tokens);
  } catch {
    throw new TradeError(
      "Could not check your wallet for positions to move back.",
      "Nothing was sent. Try Sell all again.",
    );
  }
  const toMove = tokens.flatMap((token, i) => (held[i] > 0n ? [{ token, amount: held[i] }] : []));
  if (!toMove.length) {
    onStateChange({ phase: "return", label: "Nothing in your wallet to move back", skipped: true });
    return;
  }
  onStateChange({
    phase: "return",
    label: `Moving ${toMove.length} position${toMove.length === 1 ? "" : "s"} back — confirm in your wallet`,
  });
  try {
    await depositToTradeExecutor({
      tradeExecutor,
      tokens: toMove.map((x) => x.token),
      amounts: toMove.map((x) => x.amount),
      use7702,
    });
  } catch (error) {
    throw new TradeError(
      error instanceof Error && error.message ? error.message : "Moving your positions back stopped.",
      "Nothing is lost: whatever did not move is still in your own wallet. Run Sell all again to move the rest and continue.",
    );
  }
}

// A merge unwraps each of a market's three outcome tokens; the redeem path keeps a batch to
// 30 outcomes for Optimism's per-transaction gas cap, and this is the same budget.
const SET_MERGES_PER_BATCH = 10;

/** The batches that merge each market's complete sets, before a sell-all sells what is left. */
export function completeSetMergeBatches(merges: CompleteSetMerge[], message: string): CallBatchesInput {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const input: CallBatchesInput = [];
  for (let i = 0; i < merges.length; i += SET_MERGES_PER_BATCH) {
    input.push({
      calls: merges
        .slice(i, i + SET_MERGES_PER_BATCH)
        .flatMap(({ marketId, tokens, amount }) => mergeFromRouter(router, amount, marketId, tokens)),
      message,
      phase: "unwind",
      step: i / SET_MERGES_PER_BATCH + 1,
      of: Math.ceil(merges.length / SET_MERGES_PER_BATCH),
      skipFailCalls: false,
    });
  }
  return input;
}

/**
 * Balances for the merges after the sells. The plain read returns [] on an RPC error, which merges
 * 0 and reports success with the position still in tokens; this stops instead, and says how to
 * finish — a second Sell all picks up exactly the sets this one left.
 */
async function readForMerge(tradeExecutor: Address, tokens: Address[]) {
  try {
    return await fetchTokensBalancesOrThrow(tradeExecutor, tokens);
  } catch {
    await withdrawFundSessionKey();
    throw new TradeError(
      "Your positions were sold, but the last step — merging them back to sUSDS — could not read your balances.",
      "Nothing is lost. Run \"Sell all positions\" again to finish the merge.",
    );
  }
}

async function sellToCollateral({
  tradeExecutor,
  tableData,
  parentMarketId,
  parentInvalidToken,
  middleMarkets,
  ownWallet,
  onStateChange,
}: SellAllProps & { onStateChange: TxStateChange }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  // Before the session key is authorised: these transfers are the user's own, signed in their
  // wallet, and nothing is in flight yet if they decline.
  if (ownWallet?.tokens.length) {
    await returnFromOwnWallet(tradeExecutor, ownWallet, onStateChange);
  }
  // Each repo market's complete sets (DOWN + UP + Invalid) are merged back into its collateral
  // token before anything is sold, and only what is left unmatched is sold — see
  // `planCompleteSetMerges`.
  //
  // No progress event for this read: it runs before the session key is authorised. A failed
  // read must stop the run — read as empty, every pair would be sold instead of merged.
  await waitForSentBlock();
  const heldBalances = await fetchTokensBalancesOrThrow(
    tradeExecutor,
    tableData.flatMap((row) => row.wrappedTokens),
  );
  // `rows` is what is left to sell, from balances read just now rather than the table's.
  const { merges, rows } = planCompleteSetMerges(tableData, heldBalances);
  if (merges.length) {
    const result = await toastifyBatchTxSessionKey(
      tradeExecutor,
      completeSetMergeBatches(merges, "Merging matched UP and DOWN tokens back at full value"),
      onStateChange,
    );
    if (!result.status) {
      await withdrawFundSessionKey();
      throw result.error;
    }
  } else {
    onStateChange({ phase: "unwind", label: "No matched UP and DOWN tokens to merge", skipped: true });
  }
  onStateChange({ phase: "requote", label: "Pricing your positions" });
  const sellAllQuotes = await getSellAllQuotes({
    account: tradeExecutor,
    tableData: rows,
  });
  const swapCalls = getQuoteTradeCalls(tradeExecutor, sellAllQuotes);
  const BATCH_SIZE = 100;
  // An approve and a swap per sell. A large sell costs up to ~490k gas for the pair (60 calls
  // measured 14.1M on a fork, 2026-10-02), so a 100-call batch lost its tail to the 2^24 cap —
  // and a repo market left unsold leaves its whole bundle with nothing to merge. 40 stays under
  // 10M.
  const SELL_CALLS_PER_BATCH = 40;
  const sellInput: CallBatchesInput = [];
  for (let i = 0; i < swapCalls.length; i += SELL_CALLS_PER_BATCH) {
    sellInput.push({
      calls: swapCalls.slice(i, i + SELL_CALLS_PER_BATCH),
      message: "Swapping outcome tokens back to collateral",
      phase: "sell",
      step: i / SELL_CALLS_PER_BATCH + 1,
      of: Math.ceil(swapCalls.length / SELL_CALLS_PER_BATCH),
      skipFailCalls: true,
    });
  }
  if (!sellInput.length) {
    onStateChange({ phase: "sell", label: "Nothing left to sell after merging", skipped: true });
  }
  const sellResult = await toastifyBatchTxSessionKey(
    tradeExecutor,
    sellInput,
    onStateChange,
    sellInput.length === 1 ? 30_000_000n : 15_000_000n,
  );
  if (!sellResult.status) {
    await withdrawFundSessionKey();
    throw sellResult.error;
  }
  onStateChange({ phase: "merge", label: "Reading collateral balances" });
  // The merges below are sized from balances the sells just changed; read on a lagging node they
  // come back short and part of the position is left unmerged.
  await waitForSentBlock();
  // With a middle level the sells came back as repo tokens. Merge each middle market first — a
  // complete set of its outcome tokens, Invalid included — to get the parent's outcome tokens
  // back; the parent merge below then reads balances that include what these produced.
  if (middleMarkets?.length) {
    const middleInput: CallBatchesInput = [];
    for (const [index, middle] of middleMarkets.entries()) {
      const tokens = [...middle.wrappedTokens];
      const amount = minBigIntArray(await readForMerge(tradeExecutor, tokens));
      if (amount <= 0n) continue;
      middleInput.push({
        // One market per batch: a merge unwraps every outcome token, ~34 of them here.
        calls: mergeFromRouter(router, amount, middle.marketId, tokens),
        message: "Merging repository tokens back to bundle tokens",
        phase: "merge",
        step: index + 1,
        of: middleMarkets.length,
        skipFailCalls: false,
      });
    }
    if (middleInput.length) {
      const result = await toastifyBatchTxSessionKey(tradeExecutor, middleInput, onStateChange);
      if (!result.status) {
        await withdrawFundSessionKey();
        throw result.error;
      }
    }
  }
  // One entry per parent outcome token. With a middle level those are the middle markets'
  // collateral. Without one they are the rows' own collateral: round 2 has one per repo already,
  // and in the incorrect round-3 set ~33 repos share each bundle token — listing it 33 times
  // would only repeat its approve.
  const parentOutcomeTokens = middleMarkets?.length
    ? middleMarkets.map((middle) => middle.collateralToken)
    : [...new Map(tableData.map((x) => [x.collateralToken.toLowerCase(), x.collateralToken])).values()];
  await waitForSentBlock();
  // The Invalid leg is never traded, so it only holds what was minted; once every outcome token has
  // grown past that through profitable sells, merging the outcome-token minimum would revert.
  const balances = await readForMerge(tradeExecutor, [
    ...parentOutcomeTokens,
    parentInvalidToken,
  ]);

  const mergeAmount = minBigIntArray(balances);
  if (mergeAmount > 0n) {
    const mergeCalls = [
      ...mergeFromRouter(router, mergeAmount, parentMarketId, [
        ...parentOutcomeTokens,
        parentInvalidToken,
      ]),
    ];
    const mergeInput: CallBatchesInput = [];
    for (let i = 0; i < mergeCalls.length; i += BATCH_SIZE) {
      mergeInput.push({
        calls: mergeCalls.slice(i, i + BATCH_SIZE),
        message: "Merging complete sets back to sUSDS",
        phase: "merge",
        step: i / BATCH_SIZE + 1,
        of: Math.ceil(mergeCalls.length / BATCH_SIZE),
        skipFailCalls: false,
      });
    }
    const result = await toastifyBatchTxSessionKey(tradeExecutor, mergeInput, onStateChange);
    if (!result.status) {
      await withdrawFundSessionKey();
      throw result.error;
    }
  }
  await withdrawFundSessionKey();
  return sellResult;
}

export const useSellToCollateral = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationKey: TRADE_RUN_MUTATION_KEY,
    mutationFn: withRunLock((props: SellAllProps) => sellToCollateral({ ...props, onStateChange: progress.onStateChange })),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
