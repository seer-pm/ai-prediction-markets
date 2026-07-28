import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { CallBatchesInput } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, OCTANT_MARKET_ID, ROUTER_ADDRESSES } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Address } from "viem";
import { chunkRedeemFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances } from "./useTokensBalances";

interface RedeemOctantProps {
  tradeExecutor: Address;
  /** The Octant market's outcome tokens, in outcome order */
  wrappedTokens: Address[];
}

// redeemPositions does one unwrap per outcome + one CTF redeem, so outcome count
// dominates gas. Keep each batch under this many outcomes to stay well inside
// Optimism's 2^24 (16,777,216) per-transaction gas cap used by toastifyBatchTxSessionKey.
const MAX_OUTCOMES_PER_BATCH = 30;

async function redeemOctant({
  tradeExecutor,
  wrappedTokens,
  onStateChange,
}: RedeemOctantProps & { onStateChange: (state: string) => void }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

  // Octant is a single flat market — outcome tokens redeem straight to sUSDS,
  // with none of the parent-market phase the nested contests need.
  onStateChange("Checking balances");
  const balances = await fetchTokensBalances(tradeExecutor, wrappedTokens);

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

  if (tokens.length > 0) {
    const batches = chunkRedeemFromRouter(
      router,
      collateral.address,
      OCTANT_MARKET_ID,
      tokens,
      outcomeIndexes,
      amounts,
      MAX_OUTCOMES_PER_BATCH,
    );
    const input: CallBatchesInput = batches.map((calls, i) => ({
      calls,
      message:
        batches.length > 1
          ? `Redeeming Octant market batch ${i + 1}/${batches.length}`
          : "Redeeming Octant market",
      skipFailCalls: false,
    }));
    const result = await toastifyBatchTxSessionKey(tradeExecutor, input, onStateChange);
    if (!result.status) {
      await withdrawFundSessionKey();
      throw result.error;
    }
  }

  await withdrawFundSessionKey();
}

export const useRedeemOctant = (onSuccess?: () => unknown) => {
  const [txState, setTxState] = useState("");
  const mutation = useMutation({
    mutationFn: (props: RedeemOctantProps) => redeemOctant({ ...props, onStateChange: setTxState }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      queryClient.invalidateQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["useOctantMarketsData"] });
    },
  });
  return {
    ...mutation,
    txState,
  };
};
