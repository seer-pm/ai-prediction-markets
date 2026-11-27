/** How many times a market is priced before it is reported as skipped. */
export const QUOTE_ATTEMPTS = 3;
/** Pause before each retry, multiplied by the attempt number. */
const RETRY_DELAY_MS = 1000;

/** A market the run could not price, after every attempt. */
export interface QuoteFailure<Row> {
  row: Row;
  error: unknown;
}

/**
 * Run `task` over every item and retry the ones that threw, up to `QUOTE_ATTEMPTS` in all.
 *
 * Quotes for a whole contest go out at once, several eth_calls per leg, and a few of them fail on a
 * busy RPC. Before this, a failed quote was turned into "no trade" on the spot, so on 2026-11-27
 * three of 55 Zcash Round 2 markets were left out of a run without a word; their pools quoted
 * normally a minute later. A retry goes out with only the failures, so it is far lighter than the
 * first pass. What still fails is returned, for the run to name.
 *
 * Results keep the order of `items`.
 */
export const settleWithRetry = async <T, R>(
  items: T[],
  task: (item: T) => Promise<R>,
): Promise<{ done: { item: T; value: R }[]; failed: { item: T; error: unknown }[] }> => {
  const values = new Map<number, R>();
  let pending = items.map((item, index) => ({ item, index }));
  let failed: { item: T; index: number; error: unknown }[] = [];

  for (let attempt = 0; attempt < QUOTE_ATTEMPTS && pending.length; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    const results = await Promise.allSettled(pending.map(({ item }) => task(item)));
    failed = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") values.set(pending[i].index, result.value);
      else failed.push({ ...pending[i], error: result.reason });
    });
    pending = failed;
  }

  return {
    done: [...values.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, value]) => ({ item: items[index], value })),
    failed: failed.map(({ item, error }) => ({ item, error })),
  };
};

/** Each skipped market once, by the name the user knows it by. */
export const skippedNames = <Row>(failures: QuoteFailure<Row>[], name: (row: Row) => string) => [
  ...new Set(failures.map(({ row }) => name(row))),
];
