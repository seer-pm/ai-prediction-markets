import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { CallBatchesInput, TxStateChange } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, L2_PARENT_MARKET_ID, ROUTER_ADDRESSES } from "@/utils/constants";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";
import { useMutation } from "@tanstack/react-query";
import { useTxProgress } from "./useTxProgress";
import { Address } from "viem";
import { Execution } from "./useCheck7702Support";
import { chunkRedeemFromRouter, redeemFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances } from "./useTokensBalances";

interface RedeemL2Props {
  tradeExecutor: Address;
  /** Only markets with marketStatus === CLOSED */
  closedMarkets: { id: Address; collateralToken: Address; wrappedTokens: Address[] }[];
}

async function redeemL2({
  tradeExecutor,
  closedMarkets,
  onStateChange,
}: RedeemL2Props & { onStateChange: TxStateChange }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

  // ── Phase 1: redeem conditional market tokens → receive parent outcome tokens ──
  onStateChange({ phase: "redeem", label: "Reading your settled balances" });
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
      of: phase1Batches.length + 1,
      skipFailCalls: false,
    }));
    const phase1Result = await toastifyBatchTxSessionKey(tradeExecutor, phase1Input, onStateChange);
    if (!phase1Result.status) {
      await withdrawFundSessionKey();
      throw phase1Result.error;
    }
  }

  // ── Phase 2: redeem parent outcome tokens → receive sUSDS ──
  onStateChange({ phase: "redeem", label: "Reading parent token balances" });
  const parentTokens = l2MarketOutcomes as Address[];
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
      L2_PARENT_MARKET_ID,
      parentRedeemTokens,
      parentOutcomeIndexes,
      parentAmounts,
      MAX_OUTCOMES_PER_BATCH,
    );
    const phase2Input: CallBatchesInput = parentBatches.map((calls, i) => ({
      calls,
      message: "Redeeming parent market to sUSDS",
      phase: "redeem",
      step: i + 1,
      of: parentBatches.length,
      skipFailCalls: false,
    }));
    const phase2Result = await toastifyBatchTxSessionKey(tradeExecutor, phase2Input, onStateChange);
    if (!phase2Result.status) {
      await withdrawFundSessionKey();
      throw phase2Result.error;
    }
  }

  onStateChange({ phase: "settle", label: "Returning unused gas" });
  await withdrawFundSessionKey();
}

export const useRedeemL2 = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: RedeemL2Props) =>
      redeemL2({ ...props, onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["fetchL2MarketsData"] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
