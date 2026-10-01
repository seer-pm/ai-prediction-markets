import { ContestProvider } from "@/components/contest/ContestContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { OriginalityR3IncorrectMarkets } from "@/components/tabs/OriginalityMarkets";
import { Button, Card, EmptyState, Panel } from "@/components/ui";
import { ExternalIcon } from "@/components/ui/icons";
import { ORIGINALITY_ROUND_3_INCORRECT } from "@/utils/originalityRounds";

const seerMarketUrl = (marketId: string) => `https://app.seer.pm/markets/10/${marketId}`;

/**
 * What the people who traded the first Round 3 set need to know: how to get out, what happens to
 * the part a sell-all leaves behind, and what happens to their profit or loss.
 *
 * The button sits under the text rather than in `Panel`'s `actions` slot: beside it, on a phone,
 * it squeezes the message into a column a few words wide.
 */
export function Round3WithdrawNotice({ onOpenRound3 }: { onOpenRound3: () => void }) {
  return (
    <Panel tone="error" title="This market set is incorrect — withdraw your funds">
      <p>
        These Round 3 markets were created with a level missing and have been replaced. Trading
        here is closed. If you hold positions, use <strong>Sell all positions</strong> below to
        convert them back to sUSDS, then withdraw from your trade wallet.
      </p>
      {/* Measured on a real sell-all (2026-10-01): 0.4228 of 0.50 sUSDS came back. The merge
          needs equal amounts of every bundle token, so it stops at the scarcest one. */}
      <p className="mt-2">
        Selling returns most of your funds now. A remainder can stay behind as unmatched tokens;
        it is not lost, and becomes redeemable here when this market resolves at the end of
        Round 3.
      </p>
      <p className="mt-2">
        <strong>If you made a loss trading these markets, it will be reimbursed.</strong> If you
        made a profit, it is yours to keep, for the inconvenience.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="sm" variant="primary" onClick={onOpenRound3}>
          Go to the corrected Round 3
        </Button>
        <a
          href={seerMarketUrl(ORIGINALITY_ROUND_3_INCORRECT.parentMarketId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-ink underline underline-offset-2"
        >
          The incorrect market on Seer
          <ExternalIcon width={13} height={13} />
        </a>
      </div>
    </Panel>
  );
}

/**
 * The first Round 3 market set, on a page of its own.
 *
 * It was created without its middle level and replaced, and the main UI no longer mentions it: no
 * tab, no notice, no row on the unclaimed-payouts board. This page is where its holders sell back
 * and withdraw, and they get here only by its link (`ROUND3_WITHDRAW_PATH`).
 */
export function Round3Withdraw({ onOpenRound3 }: { onOpenRound3: () => void }) {
  return (
    <div className="space-y-6">
      <Round3WithdrawNotice onOpenRound3={onOpenRound3} />

      <ErrorBoundary
        fallback={(error) => (
          <Card>
            <EmptyState
              title="These markets could not be displayed"
              description={error.message}
              actions={<Button onClick={() => window.location.reload()}>Reload the page</Button>}
            />
          </Card>
        )}
      >
        {/* Not `finished`: that would close "Sell all positions", which is the way out. */}
        <ContestProvider finished={false}>
          <OriginalityR3IncorrectMarkets />
        </ContestProvider>
      </ErrorBoundary>
    </div>
  );
}
