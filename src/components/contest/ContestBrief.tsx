import { StatusDot } from "@/components/ui";
import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

interface ContestBriefProps {
  /** The question the contest prices, as the asker would put it. */
  question: string;
  /** One or two sentences: what the market answers today, from live prices. */
  answer: ReactNode;
  /**
   * Who asks, what resolves it, how many markets. Each a short label and its value; `wide` facts
   * take a full row of the two-column grid a phone lays them out in.
   */
  facts: ReadonlyArray<{ label: string; value: ReactNode; wide?: boolean }>;
  /** The contest still trades. An ended one says so in place of the live mark. */
  live: boolean;
}

/**
 * The top of a contest, written for the person who asked the question as much as for the people
 * trading it: the question, what the market says today, and who asks and decides. It sits on the
 * page rather than in a card, so it reads as the page's own heading and the field below it as the
 * evidence. On a wide screen the facts take the column beside the question, which keeps the field's
 * first rows in the first screen.
 */
export function ContestBrief({ question, answer, facts, live }: ContestBriefProps) {
  return (
    <section
      aria-labelledby="contest-question"
      className="grid gap-6 pt-2 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12"
    >
      <div>
        <h1
          id="contest-question"
          className="max-w-[24ch] text-[clamp(2rem,1.4rem+1.6vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-ink"
        >
          {question}
        </h1>
        <p className="mt-4 max-w-[68ch] text-lede text-ink-2">{answer}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-4 lg:grid-cols-1 lg:content-start lg:border-t-0 lg:border-l lg:pt-1 lg:pl-6">
        {facts.map((fact) => (
          <div key={fact.label} className={cn("min-w-0", fact.wide && "col-span-2 lg:col-span-1")}>
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
