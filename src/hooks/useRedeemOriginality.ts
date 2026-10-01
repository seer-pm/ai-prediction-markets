import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxOwner, toastifyBatchTxSessionKey } from "@/lib/toastify";
import { CallBatchesInput, TxStateChange } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, ROUTER_ADDRESSES } from "@/utils/constants";
import { OriginalityMiddleMarket } from "@/utils/originalityRounds";
import { useMutation } from "@tanstack/react-query";
import { useTxProgress } from "./useTxProgress";
import { Address } from "viem";
import { Execution } from "./useCheck7702Support";
import { chunkRedeemFromRouter, redeemFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances, fetchTokensBalancesOrThrow } from "./useTokensBalances";
import { REDEEMABLE_SCAN_KEY } from "./useRedeemableScan";

interface RedeemOriginalityProps {
  tradeExecutor: Address;
  /** Only markets with marketStatus === CLOSED */
  closedMarkets: { id: Address; collateralToken: Address; wrappedTokens: Address[] }[];
  /** The Originality parent market — round 2's or round 3's. */
  parentMarketId: Address;
  /** The Originality parent market's outcome tokens — empty until the parent has settled. */
  parentTokens: Address[];
  /**
   * The SETTLED markets between the parent and the repo markets. A repo market pays out in its
   * repo token, which only becomes a parent outcome token again by redeeming its middle market.
   */
  middleMarkets?: readonly OriginalityMiddleMarket[];
  /**
   * True when redeeming from the deprecated trade executor, which has no session-key
   * mechanism (OldTradeExecutor is onlyOwner). Batches are then signed by the connected
   * owner wallet directly instead of a session key.
   */
  isOldWallet?: boolean;
}

async function redeemOriginality({
  tradeExecutor,
  closedMarkets,
  parentMarketId,
  parentTokens: parentTokensInput,
  middleMarkets,
  isOldWallet,
  onStateChange,
}: RedeemOriginalityProps & { onStateChange: TxStateChange }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;
  const submitBatches = isOldWallet ? toastifyBatchTxOwner : toastifyBatchTxSessionKey;

  // ── Phase 1: redeem conditional market tokens → receive parent outcome tokens ──
  // No progress event for this read: it runs before the session key is
  // authorised, and reporting it as the redeem phase made the ledger tick
  // "Redeem settled positions" off while "Authorise the run" was still going.
  const allConditionalTokens = closedMarkets.flatMap((m) => m.wrappedTokens);
  const conditionalBalances = await fetchTokensBalances(tradeExecutor, allConditionalTokens);

  // Build a balance map for quick lookup
  const balanceMap = new Map<string, bigint>(
    allConditionalTokens.map((token, i) => [token.toLowerCase(), conditionalBalances[i]]),
  );

  // Group calls by market and track outcome count as a gas proxy.
  // redeemPositions does one unwrap per outcome + one CTF redeem, so outcome count
  // dominates gas. Keep each batch under MAX_OUTCOMES_PER_BATCH to stay well inside
  // Optimism's 2^24 (16,777,216) per-transaction gas cap used by toastifyBatchTxSessionKey.
  const MAX_OUTCOMES_PER_BATCH = 30;
  const marketGroups: { calls: Execution[]; outcomeCount: number }[] = [];

  for (const market of closedMarkets) {
    const tokens: Address[] = [];
    const outcomeIndexes: bigint[] = [];
    const amounts: bigint[] = [];

    for (let i = 0; i < market.wrappedTokens.length; i++) {
      const token = market.wrappedTokens[i];
      const balance = balanceMap.get(token.toLowerCase()) ?? 0n;
      if (balance > 0n) {
        tokens.push(token);
        outcomeIndexes.push(BigInt(i));
        amounts.push(balance);
      }
    }

    if (tokens.length > 0) {
      marketGroups.push({
        calls: redeemFromRouter(router, collateral.address, market.id, tokens, outcomeIndexes, amounts),
        outcomeCount: outcomeIndexes.length,
      });
    }
  }

  // Greedily pack market groups into gas-bounded batches.
  // A single market that exceeds the budget on its own gets its own batch.
  const phase1Batches: Execution[][] = [];
  let currentBatch: Execution[] = [];
  let currentOutcomes = 0;
  for (const group of marketGroups) {
    if (currentBatch.length > 0 && currentOutcomes + group.outcomeCount > MAX_OUTCOMES_PER_BATCH) {
      phase1Batches.push(currentBatch);
      currentBatch = [];
      currentOutcomes = 0;
    }
    currentBatch.push(...group.calls);
    currentOutcomes += group.outcomeCount;
  }
  if (currentBatch.length > 0) phase1Batches.push(currentBatch);

  if (phase1Batches.length > 0) {
    const phase1Input: CallBatchesInput = phase1Batches.map((calls, i) => ({
      calls,
      message: "Redeeming child markets to parent tokens",
      phase: "redeem",
      step: i + 1,
      of: phase1Batches.length,
      skipFailCalls: false,
    }));
    const phase1Result = await submitBatches(tradeExecutor, phase1Input, onStateChange);
    if (!phase1Result.status) {
      if (!isOldWallet) await withdrawFundSessionKey();
      throw phase1Result.error;
    }
  }

  // ── Middle level: redeem repo tokens → receive bundle tokens ──
  // Balances are read here, after phase 1, so they include the repo tokens it just paid out.
  if (middleMarkets?.length) {
    onStateChange({ phase: "redeem", label: "Reading repository token balances" });
    const middleBatches: Execution[][] = [];
    for (const middle of middleMarkets) {
      const tokens = [...middle.wrappedTokens];
      // A failed read must stop the run: read as empty it would skip this level and leave what
      // phase 1 paid out sitting in repo tokens, with the run reporting success.
      const balances = await fetchTokensBalancesOrThrow(tradeExecutor, tokens).catch(async (error) => {
        if (!isOldWallet) await withdrawFundSessionKey();
        throw error;
      });
      const held = tokens
        .map((token, index) => ({ token, index: BigInt(index), amount: balances[index] }))
        .filter(({ amount }) => amount > 0n);
      if (!held.length) continue;
      // ~34 outcomes to a middle market, so it is chunked like the parent below.
      middleBatches.push(
        ...chunkRedeemFromRouter(
          router,
          collateral.address,
          middle.marketId,
          held.map(({ token }) => token),
          held.map(({ index }) => index),
          held.map(({ amount }) => amount),
          MAX_OUTCOMES_PER_BATCH,
        ),
      );
    }
    if (middleBatches.length > 0) {
      const middleInput: CallBatchesInput = middleBatches.map((calls, i) => ({
        calls,
        message: "Redeeming repository tokens to bundle tokens",
        phase: "redeem",
        step: i + 1,
        of: middleBatches.length,
        skipFailCalls: false,
      }));
      const middleResult = await submitBatches(tradeExecutor, middleInput, onStateChange);
      if (!middleResult.status) {
        if (!isOldWallet) await withdrawFundSessionKey();
        throw middleResult.error;
      }
    }
  }

  // ── Phase 2: redeem parent outcome tokens → receive sUSDS ──
  onStateChange({ phase: "redeem", label: "Reading parent token balances" });
  const parentTokens = parentTokensInput;
  const parentBalances = await fetchTokensBalances(tradeExecutor, parentTokens);

  const parentRedeemTokens: Address[] = [];
  const parentOutcomeIndexes: bigint[] = [];
  const parentAmounts: bigint[] = [];

  for (let i = 0; i < parentTokens.length; i++) {
    if (parentBalances[i] > 0n) {
      parentRedeemTokens.push(parentTokens[i]);
      parentOutcomeIndexes.push(BigInt(i));
      parentAmounts.push(parentBalances[i]);
    }
  }

  if (parentRedeemTokens.length > 0) {
    // The parent market can have many outcomes; chunk it the same way as phase 1
    // so each batchExecute call stays under Optimism's per-transaction gas cap.
    const parentBatches = chunkRedeemFromRouter(
      router,
      collateral.address,
      parentMarketId,
      parentRedeemTokens,
      parentOutcomeIndexes,
      parentAmounts,
      MAX_OUTCOMES_PER_BATCH,
    );
    const phase2Input: CallBatchesInput = parentBatches.map((calls, i) => ({
      calls,
      message:
        parentBatches.length > 1
          ? `Redeeming parent market batch ${i + 1}/${parentBatches.length}`
          : "Redeeming parent market",
      skipFailCalls: false,
    }));
    const phase2Result = await submitBatches(tradeExecutor, phase2Input, onStateChange);
    if (!phase2Result.status) {
      if (!isOldWallet) await withdrawFundSessionKey();
      throw phase2Result.error;
    }
  }

  if (!isOldWallet) await withdrawFundSessionKey();
}

export const useRedeemOriginality = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: RedeemOriginalityProps) =>
      redeemOriginality({ ...props, onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      // Refetch, not invalidate: the redeem CTA now hides itself on a zero balance, and a
      // lazily-invalidated cache would leave it on screen until the next mount.
      queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["fetchOriginalityMarketsData"] });
      // The wallet board advertises this claim from a cached scan; without this it keeps
      // advertising one the user has just made.
      queryClient.refetchQueries({ queryKey: [REDEEMABLE_SCAN_KEY] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
