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

      {/* On a phone the facts run as one line of small text, so the field starts sooner; from sm they
          are a grid, and beside the question from lg. */}
      <dl className="border-t border-rule pt-3 text-micro text-ink-3 sm:grid sm:grid-cols-4 sm:gap-x-6 sm:gap-y-3 sm:pt-4 sm:text-body lg:grid-cols-1 lg:content-start lg:border-t-0 lg:border-l lg:pt-1 lg:pl-6">
        {[...facts, { label: "Status", value: null as ReactNode }].map((fact, index) => (
          <div
            key={fact.label}
            className={cn(
              "inline sm:block sm:min-w-0",
              fact.wide && "sm:col-span-2 lg:col-span-1",
              index > 0 && "before:mx-1.5 before:content-['·'] sm:before:content-none",
            )}
          >
            <dt className="inline sm:block sm:text-micro">{fact.label}</dt>{" "}
            <dd className="inline font-semibold text-ink sm:mt-0.5 sm:flex sm:items-center sm:gap-2">
              {fact.label === "Status" ? (
                live ? (
                  <>
                    <StatusDot tone="long" pulse className="max-sm:hidden" />
                    Trading
                  </>
                ) : (
                  <>
                    <StatusDot tone="muted" className="max-sm:hidden" />
                    Ended, redeem only
                  </>
                )
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
