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
  status: RunStatus;
  className?: string;
}

type RowState = "done" | "running" | "failed" | "pending";

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
        state === "pending" && "border-rule-strong bg-surface",
      )}
    >
      {state === "done" && <CheckIcon width={12} height={12} />}
      {state === "failed" && <XIcon width={12} height={12} />}
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
export function RunLedger({ phases, current, completed, status, className }: RunLedgerProps) {
  if (status === "idle") return null;

  const currentIndex = current ? phases.indexOf(current.phase) : -1;

  const stateFor = (phase: TxPhase, index: number): RowState => {
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

          return (
            <li key={phase} className="flex items-start gap-3 px-4 py-3">
              <Marker state={state} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className={cn(
                      "text-body",
                      state === "pending" ? "text-ink-4" : "text-ink",
                      isCurrent && "font-semibold",
                    )}
                  >
                    {TX_PHASE_LABELS[phase]}
                  </p>
                  {showCounter && (
                    <span className="shrink-0 font-mono text-body font-semibold text-ink-3">
                      {current!.step}/{current!.of}
                    </span>
                  )}
                </div>

                {isCurrent && current?.label && (
                  <p className="mt-1 text-body text-ink-3">{current.label}</p>
                )}

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
