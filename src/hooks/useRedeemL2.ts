import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { CallBatchesInput } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, L2_PARENT_MARKET_ID, ROUTER_ADDRESSES } from "@/utils/constants";
import { l2MarketOutcomes } from "@/utils/l2MarketOutcomes";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Address } from "viem";
import { redeemFromRouter } from "./useExecuteL2Strategy";
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
}: RedeemL2Props & { onStateChange: (state: string) => void }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;
  const BATCH_SIZE = 100;

  // ── Phase 1: redeem conditional market tokens → receive parent outcome tokens ──
  onStateChange("Checking balances");
  const allConditionalTokens = closedMarkets.flatMap((m) => m.wrappedTokens);
  const conditionalBalances = await fetchTokensBalances(tradeExecutor, allConditionalTokens);

  // Build a balance map for quick lookup
  const balanceMap = new Map<string, bigint>(
    allConditionalTokens.map((token, i) => [token.toLowerCase(), conditionalBalances[i]]),
  );

  const redeemCalls: ReturnType<typeof redeemFromRouter>[number][] = [];
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
      redeemCalls.push(
        ...redeemFromRouter(router, market.collateralToken, market.id, tokens, outcomeIndexes, amounts),
      );
    }
  }

  if (redeemCalls.length > 0) {
    const phase1Input: CallBatchesInput = [];
    for (let i = 0; i < redeemCalls.length; i += BATCH_SIZE) {
      phase1Input.push({
        calls: redeemCalls.slice(i, i + BATCH_SIZE),
        message: `Redeeming conditional markets batch ${i / BATCH_SIZE + 1}/${Math.ceil(redeemCalls.length / BATCH_SIZE)}`,
        skipFailCalls: false,
      });
    }
    const phase1Result = await toastifyBatchTxSessionKey(tradeExecutor, phase1Input, onStateChange);
    if (!phase1Result.status) {
      await withdrawFundSessionKey();
      throw phase1Result.error;
    }
  }

  // ── Phase 2: redeem parent outcome tokens → receive sUSDS ──
  onStateChange("Updating parent token balances");
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
    const parentCalls = redeemFromRouter(
      router,
      collateral.address,
      L2_PARENT_MARKET_ID,
      parentRedeemTokens,
      parentOutcomeIndexes,
      parentAmounts,
    );
    const phase2Input: CallBatchesInput = [];
    for (let i = 0; i < parentCalls.length; i += BATCH_SIZE) {
      phase2Input.push({
        calls: parentCalls.slice(i, i + BATCH_SIZE),
        message: `Redeeming parent market batch ${i / BATCH_SIZE + 1}/${Math.ceil(parentCalls.length / BATCH_SIZE)}`,
        skipFailCalls: false,
      });
    }
    const phase2Result = await toastifyBatchTxSessionKey(tradeExecutor, phase2Input, onStateChange);
    if (!phase2Result.status) {
      await withdrawFundSessionKey();
      throw phase2Result.error;
    }
  }

  await withdrawFundSessionKey();
}

export const useRedeemL2 = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("");
  const mutation = useMutation({
    mutationFn: (props: RedeemL2Props) =>
      redeemL2({ ...props, onStateChange: setTxState }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["fetchL2MarketsData"] });
    },
  });
  return {
    ...mutation,
    txState,
  };
};
