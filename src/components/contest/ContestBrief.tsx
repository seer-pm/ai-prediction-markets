import { StatusDot } from "@/components/ui";
import type { ReactNode } from "react";

interface ContestBriefProps {
  /** The question the contest prices, as the asker would put it. */
  question: string;
  /** One or two sentences: what the market answers today, from live prices. */
  answer: ReactNode;
  /** Who asks, what resolves it, how many markets. Each a short label and its value. */
  facts: ReadonlyArray<{ label: string; value: ReactNode }>;
  /** The contest still trades. An ended one says so in place of the live mark. */
  live: boolean;
}

/**
 * The top of a contest, written for the person who asked the question as much as for the people
 * trading it: the question, what the market says today, and who asks and decides. It sits on the
 * page rather than in a card, so it reads as the page's own heading and the field below it as the
 * evidence.
 */
export function ContestBrief({ question, answer, facts, live }: ContestBriefProps) {
  return (
    <section aria-labelledby="contest-question" className="pt-2">
      <h2
        id="contest-question"
        className="max-w-[24ch] text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-ink"
      >
        {question}
      </h2>
      <p className="mt-4 max-w-[68ch] text-lede text-ink-2">{answer}</p>

      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-rule pt-4">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-micro text-ink-3">{fact.label}</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink">{fact.value}</dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="text-micro text-ink-3">Status</dt>
          <dd className="mt-0.5 flex items-center gap-2 text-body font-semibold text-ink">
            {live ? (
              <>
                <StatusDot tone="long" pulse />
                Trading
              </>
            ) : (
              <>
                <StatusDot tone="muted" />
                Ended, redeem only
              </>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
