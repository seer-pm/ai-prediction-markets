/**
 * Turns whatever the chain, the wallet or the strategy layer threw into
 * something a person can act on.
 *
 * The app already authored good domain messages (see `describeSellFailure` and
 * the unwind path in the strategy hooks) but they were wrapped in plain Error
 * and rendered through the same box as a multi-paragraph viem dump, so users
 * could not tell an instruction from a stack trace. `TradeError` marks the
 * authored ones; everything else gets mapped down to a short headline with the
 * raw text tucked behind a disclosure.
 */

/** A message we wrote for a human. Passed through verbatim. */
export class TradeError extends Error {
  /** Optional follow-up: what to do about it. */
  readonly recovery?: string;

  constructor(message: string, recovery?: string) {
    super(message);
    this.name = "TradeError";
    this.recovery = recovery;
  }
}

export interface DescribedError {
  /** One sentence, plain language. Safe to show as a panel or toast title. */
  headline: string;
  /** What the user can do next, when we know. */
  recovery?: string;
  /** Untouched original text, for the "Show technical details" disclosure. */
  raw?: string;
}

interface ErrorLike {
  name?: string;
  message?: string;
  shortMessage?: string;
  reason?: string;
  details?: string;
  cause?: unknown;
  body?: { description?: string };
}

/**
 * Matched against the whole error text, first hit wins. Ordered most specific
 * first — "insufficient funds for gas" must beat the bare "insufficient".
 */
const PATTERNS: Array<{ test: RegExp; headline: string; recovery?: string }> = [
  {
    test: /user rejected|user denied|rejected the request|action_rejected/i,
    headline: "You cancelled the request in your wallet.",
  },
  {
    test: /insufficient funds for (gas|intrinsic)/i,
    headline: "Not enough ETH to pay for gas.",
    recovery: "Add a small amount of ETH on Optimism to the connected account and try again.",
  },
  {
    test: /transfer amount exceeds balance|insufficient balance|erc20: transfer/i,
    headline: "The trade wallet does not hold enough of that token.",
    recovery: "Refresh balances and try again — a previous run may have moved them.",
  },
  {
    test: /nonce (too low|has already been used)|replacement transaction underpriced/i,
    headline: "A transaction from this account is already in flight.",
    recovery: "Wait for the pending transaction to confirm, then try again.",
  },
  {
    test: /chain mismatch|chain of the wallet|does not match the target chain/i,
    headline: "Your wallet is on the wrong network.",
    recovery: "Switch to Optimism and try again.",
  },
  {
    test: /connectornotconnected|no connector|not connected/i,
    headline: "Connect your wallet to continue.",
  },
  {
    test: /timed out|timeout/i,
    headline: "The network took too long to respond.",
    recovery: "Check the block explorer before retrying — the transaction may still have landed.",
  },
  {
    test: /too many requests|rate limit|429/i,
    headline: "The RPC provider is rate limiting this session.",
    recovery: "Wait a moment and try again.",
  },
  {
    test: /gas required exceeds|out of gas|exceeds block gas limit/i,
    headline: "The batch was too large to fit in one transaction.",
    recovery: "Reduce the number of predictions or run the strategy in smaller passes.",
  },
  {
    test: /slippage|sqrt_price_limit|spl\b|too little received/i,
    headline: "Prices moved while the trade was being submitted.",
    recovery: "Reopen the strategy so fresh quotes are fetched, then execute again.",
  },
  {
    test: /execution reverted/i,
    headline: "The contract rejected the transaction.",
    recovery: "Balances or quotes were probably stale. Reopen the dialog and try again.",
  },
];

function collectText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current && depth < 5) {
    const e = current as ErrorLike;
    for (const value of [e.shortMessage, e.reason, e.details, e.message, e.body?.description]) {
      if (typeof value === "string" && value && !parts.includes(value)) parts.push(value);
    }
    current = e.cause;
    depth++;
  }

  return parts.join("\n");
}

/** Trim viem's boilerplate tail so the disclosure stays readable. */
function tidyRaw(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => !/^\s*(Docs:|Version:)/.test(line))
    .join("\n")
    .trim();
}

export function describeError(error: unknown): DescribedError {
  if (!error) return { headline: "Something went wrong." };

  if (error instanceof TradeError) {
    return { headline: error.message, recovery: error.recovery };
  }

  if (typeof error === "string") {
    return { headline: error };
  }

  const e = error as ErrorLike;
  const text = collectText(error);
  const raw = tidyRaw(text) || undefined;

  for (const { test, headline, recovery } of PATTERNS) {
    if (test.test(text)) return { headline, recovery, raw };
  }

  // Fall back to the shortest thing viem gives us, never the full dump.
  const short = e.shortMessage ?? e.reason ?? e.body?.description;
  if (short) return { headline: short, raw };

  const firstLine = text.split("\n")[0]?.trim();
  if (firstLine) {
    return {
      headline: firstLine.length > 160 ? "The transaction could not be completed." : firstLine,
      raw,
    };
  }

  return { headline: "The transaction could not be completed.", raw };
}

/** Single-line form, for toasts and other tight spaces. */
export function getErrorHeadline(error: unknown): string {
  return describeError(error).headline;
}
