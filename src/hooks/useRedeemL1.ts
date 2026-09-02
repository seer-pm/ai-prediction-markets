import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { CallBatchesInput, TxStateChange } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, L1_MARKET_ID, ROUTER_ADDRESSES } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";
import { chunkRedeemFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances } from "./useTokensBalances";
import { useTxProgress } from "./useTxProgress";

interface RedeemL1Props {
  tradeExecutor: Address;
  /** The nested "Other repositories" market. Omitted while it has not closed, skipping phase 1. */
  otherMarket?: { id: Address; wrappedTokens: Address[] };
  /** The parent's outcome tokens, in outcome order. Omitted while it has not closed. */
  parentTokens?: Address[];
}

// redeemPositions does one unwrap per outcome + one CTF redeem, so outcome count dominates gas.
// Keep each batch under this many outcomes to stay well inside Optimism's 2^24 (16,777,216)
// per-transaction gas cap used by toastifyBatchTxSessionKey. The parent has 68 outcomes.
const MAX_OUTCOMES_PER_BATCH = 30;

/** Tokens the wallet actually holds, paired with the outcome index `redeemPositions` expects. */
function selectHeldOutcomes(wrappedTokens: Address[], balances: bigint[]) {
  const tokens: Address[] = [];
  const outcomeIndexes: bigint[] = [];
  const amounts: bigint[] = [];
  for (let i = 0; i < wrappedTokens.length; i++) {
    const balance = balances[i] ?? 0n;
    if (balance > 0n) {
      tokens.push(wrappedTokens[i]);
      outcomeIndexes.push(BigInt(i));
      amounts.push(balance);
    }
  }
  return { tokens, outcomeIndexes, amounts };
}

/**
 * L1 is a two-level market, so claiming it is the mint in reverse (see `useExecuteTradeStrategy`):
 * the "Other repositories" child redeems into the parent's outcome-66 token, and only then does the
 * parent redeem to sUSDS. Same shape as `useRedeemL2`, with a single child instead of many.
 */
async function redeemL1({
  tradeExecutor,
  otherMarket,
  parentTokens,
  onStateChange,
}: RedeemL1Props & { onStateChange: TxStateChange }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

  // ── Phase 1: "Other repositories" child tokens → the parent's outcome-66 token ──
  // No progress event for this read: it runs before the session key is authorised, and reporting
  // it as the redeem phase made the ledger tick "Redeem settled positions" off while
  // "Authorise the run" was still going.
  if (otherMarket && otherMarket.wrappedTokens.length > 0) {
    const balances = await fetchTokensBalances(tradeExecutor, otherMarket.wrappedTokens);
    const { tokens, outcomeIndexes, amounts } = selectHeldOutcomes(
      otherMarket.wrappedTokens,
      balances,
    );

    if (tokens.length > 0) {
      // sUSDS as the collateral argument even though the child is collateralized in the parent's
      // outcome token: the Router walks the parent collection itself. Same as `useRedeemL2`.
      const batches = chunkRedeemFromRouter(
        router,
        collateral.address,
        otherMarket.id,
        tokens,
        outcomeIndexes,
        amounts,
        MAX_OUTCOMES_PER_BATCH,
      );
      const input: CallBatchesInput = batches.map((calls, i) => ({
        calls,
        // User-facing copy stays neutral about the two levels. L1 is one contest as far as anyone
        // trading it is concerned; "Other repositories" and "parent tokens" are an implementation
        // detail of how the claim is settled, and naming them mid-run only raises questions.
        message: "Claiming your settled positions",
        phase: "redeem",
        step: i + 1,
        of: batches.length,
        skipFailCalls: false,
      }));
      const result = await toastifyBatchTxSessionKey(tradeExecutor, input, onStateChange);
      if (!result.status) {
        await withdrawFundSessionKey();
        throw result.error;
      }
    }
  }

  // ── Phase 2: parent outcome tokens → sUSDS ──
  // Read after phase 1, which mints the outcome-66 token this phase then redeems.
  if (parentTokens && parentTokens.length > 0) {
    onStateChange({ phase: "redeem", label: "Reading your balances" });
    const balances = await fetchTokensBalances(tradeExecutor, parentTokens);
    const { tokens, outcomeIndexes, amounts } = selectHeldOutcomes(parentTokens, balances);

    if (tokens.length > 0) {
      const batches = chunkRedeemFromRouter(
        router,
        collateral.address,
        L1_MARKET_ID,
        tokens,
        outcomeIndexes,
        amounts,
        MAX_OUTCOMES_PER_BATCH,
      );
      const input: CallBatchesInput = batches.map((calls, i) => ({
        calls,
        message: "Converting your payout to sUSDS",
        phase: "redeem",
        step: i + 1,
        of: batches.length,
        skipFailCalls: false,
      }));
      const result = await toastifyBatchTxSessionKey(tradeExecutor, input, onStateChange);
      if (!result.status) {
        await withdrawFundSessionKey();
        throw result.error;
      }
    }
  }

  onStateChange({ phase: "settle", label: "Returning unused gas" });
  await withdrawFundSessionKey();
}

export const useRedeemL1 = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: RedeemL1Props) =>
      redeemL1({ ...props, onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      // Refetch, not invalidate: the redeem CTA now hides itself on a zero balance, and a
      // lazily-invalidated cache would leave it on screen until the next mount.
      queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["useL1MarketsData"] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
