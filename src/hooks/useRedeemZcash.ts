import { queryClient } from "@/config/queryClient";
import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { CallBatchesInput, TxStateChange } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, ROUTER_ADDRESSES } from "@/utils/constants";
import { useMutation } from "@tanstack/react-query";
import { Address } from "viem";
import { redeemFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances } from "./useTokensBalances";
import { useTxProgress } from "./useTxProgress";

interface RedeemZcashProps {
  tradeExecutor: Address;
  /** One entry per Zcash market, each with its outcome tokens in outcome order `[YES, NO, INVALID]`. */
  markets: { id: Address; wrappedTokens: Address[] }[];
}

/**
 * Zcash inverts the batching problem the other contests have. Octant is one market with many
 * outcomes, so `chunkRedeemFromRouter` splits a single `redeemPositions` across several calls.
 * Here there are 37 markets of three outcomes each, so every market needs its own
 * `redeemPositions` and the batching groups *markets* instead.
 *
 * Ten markets is thirty outcome unwraps per transaction — the same outcome budget Octant settled
 * on, and comfortably inside Optimism's 2^24 per-transaction gas cap (`OPTIMISM_MAX_TX_GAS`).
 */
const MAX_MARKETS_PER_BATCH = 10;

async function redeemZcash({
  tradeExecutor,
  markets,
  onStateChange,
}: RedeemZcashProps & { onStateChange: TxStateChange }) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

  // These are top-level markets collateralized in sUSDS, so outcome tokens redeem straight to
  // sUSDS with none of the parent-market phase the nested contests need.
  //
  // No progress event for this read: it runs before the session key is authorised, and reporting
  // it as the redeem phase made the ledger tick "Redeem settled positions" off while
  // "Authorise the run" was still going.
  const allTokens = markets.flatMap((market) => market.wrappedTokens);
  const allBalances = await fetchTokensBalances(tradeExecutor, allTokens);

  // Walk the flat balance array back into per-market groups. Invalid is included deliberately:
  // on this market set a withdrawn proposal resolves Invalid, so that token can be the only one
  // worth anything.
  const redeemable: { marketId: Address; calls: ReturnType<typeof redeemFromRouter> }[] = [];
  let cursor = 0;
  for (const market of markets) {
    const tokens: Address[] = [];
    const outcomeIndexes: bigint[] = [];
    const amounts: bigint[] = [];

    for (let i = 0; i < market.wrappedTokens.length; i++) {
      const balance = allBalances[cursor + i] ?? 0n;
      if (balance > 0n) {
        tokens.push(market.wrappedTokens[i]);
        outcomeIndexes.push(BigInt(i));
        amounts.push(balance);
      }
    }
    cursor += market.wrappedTokens.length;

    if (tokens.length > 0) {
      redeemable.push({
        marketId: market.id,
        calls: redeemFromRouter(
          router,
          collateral.address,
          market.id,
          tokens,
          outcomeIndexes,
          amounts,
        ),
      });
    }
  }

  if (redeemable.length > 0) {
    const input: CallBatchesInput = [];
    for (let i = 0; i < redeemable.length; i += MAX_MARKETS_PER_BATCH) {
      const group = redeemable.slice(i, i + MAX_MARKETS_PER_BATCH);
      const batchNumber = Math.floor(i / MAX_MARKETS_PER_BATCH) + 1;
      const batchCount = Math.ceil(redeemable.length / MAX_MARKETS_PER_BATCH);
      input.push({
        calls: group.flatMap((entry) => entry.calls),
        message:
          batchCount > 1
            ? `Redeeming Zcash markets batch ${batchNumber}/${batchCount}`
            : "Redeeming Zcash markets",
        skipFailCalls: false,
      });
    }
    const result = await toastifyBatchTxSessionKey(tradeExecutor, input, onStateChange);
    if (!result.status) {
      await withdrawFundSessionKey();
      throw result.error;
    }
  }

  onStateChange({ phase: "settle", label: "Returning unused gas" });
  await withdrawFundSessionKey();
}

export const useRedeemZcash = (onSuccess?: () => unknown) => {
  const progress = useTxProgress();
  const mutation = useMutation({
    mutationFn: (props: RedeemZcashProps) =>
      redeemZcash({ ...props, onStateChange: progress.onStateChange }),
    onSuccess() {
      onSuccess?.();
      queryClient.refetchQueries({ queryKey: ["useTokenBalance"] });
      // Refetch, not invalidate: the redeem CTA now hides itself on a zero balance, and a
      // lazily-invalidated cache would leave it on screen until the next mount.
      queryClient.refetchQueries({ queryKey: ["useTokensBalances"] });
      queryClient.refetchQueries({ queryKey: ["fetchZcashMarketsData"] });
    },
  });
  return {
    ...mutation,
    progress,
  };
};
