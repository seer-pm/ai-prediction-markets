import { MIN_PRICE } from "@/utils/constants";

/**
 * Turning what the user actually typed for one NU7 ballot question into a complete distribution.
 *
 * A NU7 market is single-select categorical: exactly one of its outcomes resolves, and a complete
 * set redeems for exactly 1 sUSDS. So the true probabilities of one question sum to 1, and the pool
 * prices are held there by the mint-and-sell-the-basket arbitrage — see the header of
 * `./zcashNu7Markets`, which records that the substantive prices "sum to ~1 within a market".
 *
 * The predictions file does not have to say all of it. A partial question is the normal case and
 * stays legal. But a partial set of *targets* is not an incomplete instruction, it is an incoherent
 * one: it never says where the probability mass comes from. Buying outcome 2 from 0.25 to 0.40 and
 * leaving the other three alone puts the basket at 1.15, and the first arbitrageur to notice mints a
 * set for 1, sells all four legs for 1.15, and takes the user's own price move straight back out.
 * The user paid gas and slippage to move a pool the market immediately undoes.
 *
 * So the file is read as a partial statement about a whole distribution, and this module completes
 * it. That is not a new idea here — it is what the binary contest already does with a single number
 * per market (`useProcessZcashPredictions`: `noTarget = 1 - yesTarget`), generalised from two
 * outcomes to three or four. NU7 was the only contest that skipped the step.
 *
 * A blank outcome therefore means "no view, keep the market's relative view among these" — NOT
 * "implicitly zero". That distinction is the whole reason the residual is split pro-rata by pool
 * price rather than evenly: weighting by the market leaves each derived target sitting near its own
 * pool, so the derived legs move only as far as the user's own numbers force them to. An even split
 * would assert a flatness the user never claimed and spend budget saying it.
 *
 * Pure, and deliberately no wider than that: it takes plain numbers and returns plain numbers, so
 * the arithmetic can be checked on its own. Same separation `zcashNu7Budget` keeps from
 * `lib/trade/getZcashNu7Quote`.
 */

/**
 * How far a question's own rows may sum from 1 before it is called a mistake rather than rounding.
 *
 * Four outcomes written to two decimal places drift by up to 0.02, so anything tighter would reject
 * files that are correct as written. Shared with `parseZcashNu7CSV`, which rejects a question
 * summing ABOVE `1 + this` — no assignment to the outcomes left out could rescue such a file, so it
 * is impossible whatever the on-chain outcome count turns out to be.
 */
export const NU7_SUM_TOLERANCE = 0.02;

/**
 * Below this much residual, the outcomes the file left out are being driven to ~0.
 *
 * That is a faithful reading — the user's own numbers claimed the entire question — but it is a
 * large thing to do on the strength of an omission, so it is surfaced rather than done quietly.
 */
const NU7_RESIDUAL_FLOOR = 0.01;

export interface Nu7TargetLeg {
  /** 1-based over the question's substantive outcomes — the number the CSV keys on. */
  outcomeNumber: number;
  /** Current pool price. Null means no pool: excluded here, and untradable anyway. */
  price: number | null;
  /** What the file said for this outcome, if it said anything. */
  raw?: number;
}

/** Why a completion is worth mentioning to the user. Absent when nothing surprising happened. */
export type Nu7CompletionNote = "renormalised" | "residual-exhausted";

export interface Nu7Completion {
  /** outcomeNumber -> target. Pooled outcomes only, and always summing to 1 across them. */
  targets: Map<number, number>;
  source: Map<number, "file" | "derived">;
  note?: Nu7CompletionNote;
  /** What the file's own rows summed to, before anything was done to them. */
  namedSum: number;
  /** How many pooled outcomes the file left for us to fill in. */
  derivedCount: number;
}

/**
 * `MIN_PRICE` keeps every target off the extremes — a pool cannot be sold to 0, and
 * `getVolumeUntilPrice` divides by the target. The same guard the other contests apply, moved here
 * because this is now the last place a target is decided.
 */
const clamp = (value: number) => Math.min(Math.max(value, MIN_PRICE), 1 - MIN_PRICE);

/**
 * Complete one question's targets.
 *
 * Over pooled outcomes only. An outcome with a prediction but no pool is already reported as a
 * `no-pool` issue by the caller and takes no part here: it cannot be traded, and it has no price to
 * weight a residual by.
 *
 *     N = outcomes the file named        m = sum of their targets
 *     U = pooled outcomes it did not     p_i = outcome i's current pool price
 *
 * - U non-empty. The named targets stand as written and the residual r = 1 - m is split across U in
 *   proportion to the market's own prices: `t_i = r * p_i / sum_U p_j`. If those pools are all at 0
 *   there is no relative view to preserve, so it falls back to an even split. m can still exceed 1
 *   by up to `NU7_SUM_TOLERANCE` (the parser's threshold is `1 + NU7_SUM_TOLERANCE`, not 1), in
 *   which case the named side is scaled to fit and U takes nothing.
 *
 * - U empty — the file named every pooled outcome. There is nothing else to hold the mass, so the
 *   named targets are renormalised onto 1 rather than rejected. This is also the only route by
 *   which a question summing *below* 1 is handled at all: the parser cannot catch that case,
 *   because outcome counts live on chain and it has no way to know whether a short file is a
 *   complete question or a partial one.
 *
 * Returns null when the file named nothing here — an omitted question still means "no view", and
 * nothing about it is traded.
 */
export const completeNu7Targets = (legs: Nu7TargetLeg[]): Nu7Completion | null => {
  const pooled = legs.filter((leg) => leg.price !== null);
  const named = pooled.filter((leg) => leg.raw !== undefined);
  if (!named.length) return null;

  const unnamed = pooled.filter((leg) => leg.raw === undefined);
  const namedSum = named.reduce((sum, leg) => sum + (leg.raw as number), 0);

  const targets = new Map<number, number>();
  const source = new Map<number, "file" | "derived">();
  let note: Nu7CompletionNote | undefined;

  if (!unnamed.length) {
    // `namedSum` of 0 would divide by zero; every target is already 0 in that case, which clamps to
    // MIN_PRICE and carries the note, so a scale of 0 is the right degenerate answer rather than NaN.
    const scale = namedSum > 0 ? 1 / namedSum : 0;
    if (Math.abs(namedSum - 1) > NU7_SUM_TOLERANCE) note = "renormalised";
    for (const leg of named) {
      targets.set(leg.outcomeNumber, clamp((leg.raw as number) * scale));
      source.set(leg.outcomeNumber, "file");
    }
    return { targets, source, note, namedSum, derivedCount: 0 };
  }

  // Only bites inside the parser's tolerance band; above it the file never reached us.
  const scale = namedSum > 1 ? 1 / namedSum : 1;
  const residual = Math.max(0, 1 - namedSum * scale);
  if (residual < NU7_RESIDUAL_FLOOR) note = "residual-exhausted";

  for (const leg of named) {
    targets.set(leg.outcomeNumber, clamp((leg.raw as number) * scale));
    source.set(leg.outcomeNumber, "file");
  }

  // Negative prices are impossible, but a `max` here means a bad feed cannot flip a weight's sign
  // and hand one outcome more than the whole residual.
  const weightTotal = unnamed.reduce((sum, leg) => sum + Math.max(0, leg.price as number), 0);
  for (const leg of unnamed) {
    const weight =
      weightTotal > 0 ? Math.max(0, leg.price as number) / weightTotal : 1 / unnamed.length;
    targets.set(leg.outcomeNumber, clamp(residual * weight));
    source.set(leg.outcomeNumber, "derived");
  }

  return { targets, source, note, namedSum, derivedCount: unnamed.length };
};
