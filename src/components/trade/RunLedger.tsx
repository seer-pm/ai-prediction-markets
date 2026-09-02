import { Spinner } from "@/components/ui";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import type { TxProgress, TxPhase } from "@/types";
import { cn } from "@/utils/cn";
import { TX_PHASE_LABELS, type RunStatus } from "@/utils/txPhases";

interface RunLedgerProps {
  /** The stages this operation walks through, in order. */
  phases: TxPhase[];
  current?: TxProgress;
  /** Stages already entered, in the order they were entered. */
  completed: TxPhase[];
  /** Stages the run reported as having nothing to do, each with the reason it gave. */
  skipped?: TxProgress[];
  status: RunStatus;
  className?: string;
}

type RowState = "done" | "running" | "failed" | "skipped" | "pending";

function Marker({ state }: { state: RowState }) {
  if (state === "running") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-primary">
        <Spinner size={16} />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
        state === "done" && "border-long bg-long text-white",
        state === "failed" && "border-short bg-short text-white",
        // A skipped stage is neither a success nor a failure: an outlined dash, so a glance down
        // the column still reads as "these ran, this one had nothing to do".
        state === "skipped" && "border-rule-strong bg-sunken text-ink-4",
        state === "pending" && "border-rule-strong bg-surface",
      )}
    >
      {state === "done" && <CheckIcon width={12} height={12} />}
      {state === "failed" && <XIcon width={12} height={12} />}
      {state === "skipped" && <span className="h-px w-2 bg-current" />}
    </span>
  );
}

/**
 * The run made visible.
 *
 * A strategy signs twice and then submits a dozen batches over several
 * minutes. This lists every stage up front, marks the one in flight with its
 * batch counter, keeps finished stages on screen, and stays put afterwards as
 * a receipt of what actually ran.
 */
export function RunLedger({
  phases,
  current,
  completed,
  skipped = [],
  status,
  className,
}: RunLedgerProps) {
  if (status === "idle") return null;

  const currentIndex = current ? phases.indexOf(current.phase) : -1;

  const stateFor = (phase: TxPhase, index: number): RowState => {
    // Checked first, and it outranks everything below — including the blanket "done" a finished
    // run hands out. A stage that had nothing to do must not be reported as work performed.
    if (skipped.some((entry) => entry.phase === phase)) return "skipped";
    if (status === "failed") {
      if (current?.phase === phase) return "failed";
      return completed.includes(phase) ? "done" : "pending";
    }
    if (status === "succeeded") return "done";
    if (current?.phase === phase) return "running";
    // Phases can be skipped (nothing to sell, no mint) — anything before the
    // running one counts as settled.
    if (currentIndex >= 0 && index < currentIndex) return "done";
    // Nothing after the running stage can be finished, whatever `completed`
    // says. A run that reports a later phase early (a pre-flight read, say)
    // would otherwise show it ticked off before it had happened.
    if (currentIndex >= 0 && index > currentIndex) return "pending";
    return completed.includes(phase) ? "done" : "pending";
  };

  return (
    <div className={cn("rounded-lg border border-rule bg-sunken", className)}>
      <div className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <p className="text-label font-semibold tracking-wider text-ink-3 uppercase">Run progress</p>
        <p className="text-body font-medium text-ink-3">
          {status === "running" && "Keep this window open"}
          {status === "succeeded" && <span className="text-long">Completed</span>}
          {status === "failed" && <span className="text-short">Stopped</span>}
        </p>
      </div>

      <ol className="divide-y divide-rule">
        {phases.map((phase, index) => {
          const state = stateFor(phase, index);
          const isCurrent = state === "running" || state === "failed";
          const showCounter = isCurrent && current?.of && current.of > 1;
          // The skip's own reason ("Nothing is priced below your weights") is the whole point of
          // showing the row, so it stays on screen after the run moves on.
          const skipReason = skipped.find((entry) => entry.phase === phase)?.label;

          return (
            <li key={phase} className="flex items-start gap-3 px-4 py-3">
              <Marker state={state} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className={cn(
                      "text-body",
                      state === "pending" || state === "skipped" ? "text-ink-4" : "text-ink",
                      isCurrent && "font-semibold",
                    )}
                  >
                    {TX_PHASE_LABELS[phase]}
                  </p>
                  {state === "skipped" && (
                    <span className="shrink-0 text-body text-ink-4">Nothing to do</span>
                  )}
                  {showCounter && (
                    <span className="shrink-0 font-mono text-body font-semibold text-ink-3">
                      {current!.step}/{current!.of}
                    </span>
                  )}
                </div>

                {isCurrent && current?.label && (
                  <p className="mt-1 text-body text-ink-3">{current.label}</p>
                )}

                {skipReason && <p className="mt-1 text-body text-ink-4">{skipReason}</p>}

                {showCounter && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        state === "failed" ? "bg-short" : "bg-primary",
                      )}
                      style={{ width: `${Math.round(((current!.step ?? 0) / current!.of!) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
