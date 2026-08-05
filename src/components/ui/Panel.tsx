import { cn } from "@/utils/cn";
import { describeError } from "@/utils/errors";
import { useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, CopyIcon, InfoIcon } from "./icons";
import { Spinner } from "./Spinner";

type Tone = "info" | "working" | "success" | "error";

const TONES: Record<Tone, { box: string; icon: string; title: string }> = {
  info: { box: "border-rule bg-sunken", icon: "text-ink-3", title: "text-ink" },
  working: { box: "border-primary-rule bg-primary-bg", icon: "text-primary", title: "text-primary" },
  success: { box: "border-long-rule bg-long-bg", icon: "text-long", title: "text-long" },
  error: { box: "border-short-rule bg-short-bg", icon: "text-short", title: "text-short" },
};

interface PanelProps {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * One inline notice component. Replaces the near-identical ErrorPanel and
 * LoadingPanel, which differed only in colour.
 */
export function Panel({ tone = "info", title, children, actions, className }: PanelProps) {
  const { box, icon, title: titleColor } = TONES[tone];

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4",
        box,
        className,
      )}
      role={tone === "error" ? "alert" : undefined}
    >
      <span className={cn("mt-0.5 shrink-0", icon)}>
        {tone === "working" ? (
          <Spinner size={16} />
        ) : tone === "error" ? (
          <AlertIcon width={18} height={18} />
        ) : tone === "success" ? (
          <CheckIcon width={18} height={18} />
        ) : (
          <InfoIcon width={18} height={18} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-body font-semibold", titleColor)}>{title}</p>
        {children && <div className="mt-1 text-body text-ink-2">{children}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

interface ErrorPanelProps {
  title?: string;
  error: unknown;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Renders a thrown error as: one plain-language sentence, then what to do
 * about it, then the untouched provider text behind a disclosure. The raw
 * viem dump used to be the whole message.
 */
export function ErrorPanel({ title, error, onDismiss, className }: ErrorPanelProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const { headline, recovery, raw } = describeError(error);

  const copyRaw = async () => {
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the text is on screen anyway */
    }
  };

  return (
    <Panel
      tone="error"
      title={title ?? headline}
      className={className}
      actions={
        onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="cursor-pointer rounded-sm p-1 text-ink-4 transition-colors hover:text-ink"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )
      }
    >
      {title && <p>{headline}</p>}
      {recovery && <p className={title ? "mt-1" : ""}>{recovery}</p>}

      {raw && raw !== headline && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="cursor-pointer text-body text-ink-3 underline underline-offset-2 transition-colors hover:text-ink"
            aria-expanded={showRaw}
          >
            {showRaw ? "Hide technical details" : "Show technical details"}
          </button>

          {showRaw && (
            <div className="relative mt-2">
              <pre className="max-h-40 overflow-auto rounded-md border border-rule bg-surface p-3 pr-9 font-mono text-micro leading-relaxed whitespace-pre-wrap text-ink-2">
                {raw}
              </pre>
              <button
                type="button"
                onClick={copyRaw}
                className="absolute top-1.5 right-1.5 cursor-pointer rounded-sm border border-rule bg-surface p-1.5 text-ink-3 transition-colors hover:text-ink"
                aria-label="Copy technical details"
              >
                {copied ? <CheckIcon width={12} height={12} /> : <CopyIcon width={12} height={12} />}
              </button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
