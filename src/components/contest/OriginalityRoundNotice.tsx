import { Button, Panel } from "@/components/ui";
import { ExternalIcon } from "@/components/ui/icons";
import { useContestTabStore } from "@/stores/contestTabStore";
import { OriginalityRound } from "@/utils/originalityRounds";

const seerMarketUrl = (marketId: string) => `https://app.seer.pm/markets/10/${marketId}`;

/**
 * Round 3 was built twice. The first set left out a level and cannot settle the way the contest
 * intends, so it was replaced; it stays reachable only so the people who traded it can get their
 * sUSDS back. This is the notice on both tabs: on the incorrect set it says what to do, on the
 * corrected set it says where older positions went.
 *
 * The button sits under the text rather than in `Panel`'s `actions` slot: beside it, on a phone,
 * it squeezes the message into a column a few words wide.
 */
export function OriginalityRoundNotice({ round }: { round: OriginalityRound }) {
  const requestTab = useContestTabStore((state) => state.requestTab);

  if (round.incorrect) {
    return (
      <Panel tone="error" title="This market set is incorrect — withdraw your funds">
        <p>
          These Round 3 markets were created with a level missing and have been replaced. Trading
          here is closed. If you hold positions, use <strong>Sell all positions</strong> below to
          convert them back to sUSDS, then withdraw from your trade wallet.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="sm" variant="primary" onClick={() => requestTab(round.incorrect!.replacedBy)}>
            Go to the corrected Round 3
          </Button>
          <a
            href={seerMarketUrl(round.parentMarketId)}
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

  if (round.replaces) {
    return (
      <Panel title="Round 3 was relaunched with corrected markets">
        <p>
          The first Round 3 market set was created with a level missing. Positions opened before
          the relaunch are still in it: open it to sell them back to sUSDS and withdraw.
        </p>
        <div className="mt-3">
          <Button size="sm" onClick={() => requestTab(round.replaces!)}>
            Open the incorrect market
          </Button>
        </div>
      </Panel>
    );
  }

  return null;
}
