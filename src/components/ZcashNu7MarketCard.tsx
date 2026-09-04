import { Badge, Button, Card, OutcomeShareBar, Skeleton } from "@/components/ui";
import { ExternalIcon } from "@/components/ui/icons";
import type { ZcashNu7MarketData } from "@/hooks/useZcashNu7MarketsData";
import { DECIMALS, getSeerMarketUrl } from "@/utils/constants";
import { formatTokenAmount } from "@/utils/format";
import { invalidIndexOf } from "@/utils/zcashNu7Markets";
import { MarketStatus } from "@seer-pm/sdk";
import React from "react";
import { Address } from "viem";

export interface OutcomeTradeRequest {
  market: ZcashNu7MarketData;
  outcomeIndex: number;
  side: "buy" | "sell";
}

interface ZcashNu7MarketCardProps {
  market: ZcashNu7MarketData;
  /** Balances for this market's outcome tokens, in outcome order. */
  balances: (bigint | undefined)[];
  balancesLoading: boolean;
  /** False when there is no funded trade wallet — the buttons come off entirely. */
  canTrade: boolean;
  /** False once the contest is over: claiming stays, trading does not. */
  tradingOpen: boolean;
  onTrade: (request: OutcomeTradeRequest) => void;
}

/**
 * One NU7 ballot question: its outcomes, what the market pays for each, and what you hold.
 *
 * A card rather than a row in a shared table, unlike every other contest here. Those tabs list one
 * row per *market* because each market is a single binary number; this contest is five markets of
 * three to five competing outcomes, and a flat table would either lose the grouping or repeat the
 * question five times over.
 */
export const ZcashNu7MarketCard = React.memo(function ZcashNu7MarketCard({
  market,
  balances,
  balancesLoading,
  canTrade,
  tradingOpen,
  onTrade,
}: ZcashNu7MarketCardProps) {
  // Invalid is always last and never has a pool. Derived, never a literal — outcome counts differ
  // across this set (Q4 has three substantive outcomes, the rest have four).
  //
  // It is not listed: with no pool it can only ever render "No pool" and an empty balance, which
  // reads as a broken row rather than the settlement backstop it is. Nothing about *claiming* it
  // depends on this — `redeemFlatMarkets` reads every outcome's balance straight from chain, and
  // the cross-contest payout board finds it too, so an Invalid resolution still surfaces.
  const invalidIndex = invalidIndexOf(market.outcomes);
  const listedOutcomes = market.outcomes
    .map((outcome, index) => ({ outcome, index }))
    .filter(({ index }) => index !== invalidIndex);

  // The denominator for the bars. Substantive prices sum to about 1 in a healthy single-select
  // market, but drift is exactly what a trader is looking for, so the bars are drawn against the
  // real sum while the printed percentages stay raw.
  const priceSum = market.prices.reduce<number>((sum, price) => sum + (price ?? 0), 0);

  const isClosed = market.marketStatus === MarketStatus.CLOSED;

  return (
    <Card flush>
      <div className="flex flex-col gap-3 border-b border-rule px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-label font-semibold tracking-wider text-ink-3 uppercase">
            {market.shortName}
            {market.topic ? ` · ${market.topic}` : ""}
          </p>
          {/* The question doubles as the link out to Seer — the icon is what says so. */}
          <a
            href={getSeerMarketUrl(market.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link inline-flex items-start gap-1.5 text-lede font-semibold text-ink transition-colors hover:text-primary"
          >
            <span>{market.marketName}</span>
            <ExternalIcon
              width={13}
              height={13}
              className="mt-1 shrink-0 text-ink-4 transition-colors group-hover/link:text-primary"
            />
          </a>
        </div>
        {isClosed && <Badge tone="neutral">Settled</Badge>}
      </div>

      <ul className="divide-y divide-rule">
        {listedOutcomes.map(({ outcome, index }) => {
          const price = market.prices[index] ?? null;
          const balance = balances[index];
          const token = market.wrappedTokens[index] as Address;
          const hasBalance = !!balance && balance > 0n;

          return (
            <li
              key={token}
              className="flex flex-col gap-3 px-6 py-3.5 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="min-w-0 flex-1 text-body text-ink">{outcome}</span>

              <OutcomeShareBar price={price} sum={priceSum} className="shrink-0" />

              {/* Held position. */}
              <span className="w-24 shrink-0 text-left font-mono text-body text-ink-2 sm:text-right">
                {balancesLoading && balance === undefined ? (
                  <Skeleton width={56} height={13} className="sm:ml-auto" />
                ) : hasBalance ? (
                  formatTokenAmount(balance, DECIMALS)
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </span>

              <span className="flex shrink-0 gap-2">
                {canTrade && tradingOpen && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onTrade({ market, outcomeIndex: index, side: "buy" })}
                      disabled={price === null}
                      disabledReason={
                        price === null ? "This outcome has no pool to trade against." : undefined
                      }
                    >
                      Buy
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onTrade({ market, outcomeIndex: index, side: "sell" })}
                      disabled={!hasBalance || price === null}
                      disabledReason={
                        price === null
                          ? "This outcome has no pool to trade against."
                          : !hasBalance
                            ? "You hold none of this outcome."
                            : undefined
                      }
                    >
                      Sell
                    </Button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
});
