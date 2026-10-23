import { BrandStreak } from "@seer-pm/ui-kit/react";
import { ExternalIcon } from "@/components/ui/icons";
import { SEER_MARKETS_URL } from "@/utils/constants";

/**
 * Pointer to Seer's own market view, for what this app deliberately does not do (one market at a
 * time, liquidity provision, full analytics).
 *
 * Rendered per contest rather than once under the tab bar: it is an invitation to *trade*, so it
 * has nothing to say on a contest that has ended and only redeems remain.
 *
 * An ink field with the kit's line motif, as the seer.pm landing closes: it is the way out to the
 * rest of Seer, and it stays ink in both themes. `data-theme="dark"` gives what sits on it the dark
 * tokens, so the button and the text read on ink whatever the page's theme.
 */
export function SeerPromo() {
  return (
    <div
      data-theme="dark"
      className="relative isolate flex flex-col gap-4 overflow-hidden rounded-lg bg-seer-ink px-6 py-6 sm:flex-row sm:items-center sm:justify-between"
    >
      {/* Faded out toward the left, where the copy sits, so the lines never run behind text. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_right,transparent_45%,black_90%)]"
      >
        <BrandStreak className="absolute top-1/2 right-0 h-[220%] -translate-y-1/2 text-seer-purple-on-ink opacity-40" />
      </div>
      <div>
        <p className="text-lede font-semibold text-seer-on-ink">Trading one market at a time?</p>
        <p className="mt-1 text-body text-seer-on-ink-muted">
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
