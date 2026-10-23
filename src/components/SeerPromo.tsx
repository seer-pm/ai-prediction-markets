import { ExternalIcon } from "@/components/ui/icons";
import { SEER_MARKETS_URL } from "@/utils/constants";

/**
 * Pointer to Seer's own market view, for what this app deliberately does not do (one market at a
 * time, liquidity provision, full analytics).
 *
 * Rendered per contest rather than once under the tab bar: it is an invitation to *trade*, so it
 * has nothing to say on a contest that has ended and only redeems remain.
 */
export function SeerPromo() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-rule bg-surface px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-lede font-semibold text-ink">Trading one market at a time?</p>
        <p className="mt-1 text-body text-ink-3">
          Seer has the individual market view, liquidity provision and full analytics.
        </p>
      </div>
      <a
        href={SEER_MARKETS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="seer-button seer-button-secondary shrink-0 self-start sm:self-auto"
      >
        Browse on Seer
        <ExternalIcon width={13} height={13} />
      </a>
    </div>
  );
}
