import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

type Tone = "neutral" | "long" | "short" | "quiet";

const TONES: Record<Tone, string> = {
  neutral: "border-rule bg-sunken text-ink-2",
  long: "border-long-rule bg-long-bg text-long",
  short: "border-short-rule bg-short-bg text-short",
  quiet: "border-transparent bg-transparent text-ink-4",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-label font-semibold tracking-wider uppercase",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Live/idle marker. Teal only ever means "positive direction", which here is a
 * contest still accepting trades.
 */
export function StatusDot({
  tone = "long",
  pulse = false,
  className,
}: {
  tone?: "long" | "short" | "muted";
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        tone === "long" && "bg-long",
        tone === "short" && "bg-short",
        tone === "muted" && "bg-ink-4",
        pulse && "animate-pulse",
        className,
      )}
    />
  );
}
