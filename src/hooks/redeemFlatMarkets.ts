import { withdrawFundSessionKey } from "@/lib/on-chain/sessionKey";
import { toastifyBatchTxSessionKey } from "@/lib/toastify";
import { CallBatchesInput, TxStateChange } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS, ROUTER_ADDRESSES } from "@/utils/constants";
import { Address } from "viem";
import { redeemFromRouter } from "./useExecuteL2Strategy";
import { fetchTokensBalances } from "./useTokensBalances";

/**
 * Redeeming a set of *flat* markets — independent top-level markets collateralized in sUSDS with no
 * parent, so outcome tokens settle straight to collateral with none of the parent-market phase the
 * nested contests need.
 *
 * Both Zcash contests are this shape (37 binaries, and 5 categoricals), which is why the body lives
 * here rather than being copied a second time. The nested contests are genuinely different and stay
 * where they are.
 *
 * Every outcome is included, Invalid among them: on these market sets a withdrawn proposal or an
 * unresolvable ballot question resolves Invalid, so that token can be the only one worth anything.
 */
export interface FlatMarketToRedeem {
  id: Address;
  /** Outcome tokens in outcome order — which is what `redeemPositions` indexes against. */
  wrappedTokens: Address[];
}

/**
 * Ten markets is thirty outcome unwraps per transaction — the same outcome budget Octant settled
 * on, and comfortably inside Optimism's 2^24 per-transaction gas cap (`OPTIMISM_MAX_TX_GAS`).
 *
 * Note this batches *markets*, not outcomes: Octant is one market with many outcomes, so it splits
 * a single `redeemPositions` across calls, whereas here every market needs its own.
 */
const MAX_MARKETS_PER_BATCH = 10;

export async function redeemFlatMarkets({
  tradeExecutor,
  markets,
  label,
  onStateChange,
}: {
  tradeExecutor: Address;
  markets: FlatMarketToRedeem[];
  /** Contest name for the batch message, e.g. "Zcash". */
  label: string;
  onStateChange: TxStateChange;
}) {
  const router = ROUTER_ADDRESSES[CHAIN_ID];
  const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

  // No progress event for this read: it runs before the session key is authorised, and reporting
  // it as the redeem phase made the ledger tick "Redeem settled positions" off while
  // "Authorise the run" was still going.
  const allTokens = markets.flatMap((market) => market.wrappedTokens);
  const allBalances = await fetchTokensBalances(tradeExecutor, allTokens);

  // Walk the flat balance array back into per-market groups.
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
            ? `Redeeming ${label} markets batch ${batchNumber}/${batchCount}`
            : `Redeeming ${label} markets`,
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
