import type { ZcashNu7Row } from "@/types";

/**
 * A sample NU7 predictions file, for the "Sample CSV" button on the upload dialog.
 *
 * Unlike `sampleZcashPredictions`, whose whole point is shipping the exact proposal titles, this one
 * cannot teach the labels: outcome strings live on chain and appear in no static file here (see the
 * header of `./zcashNu7Markets`). So it teaches the *shape* instead — how the two index columns
 * work, and that a file may be partial.
 *
 * The numbers are placeholders, not an opinion. Two questions are annotated and three are left out
 * entirely; Q1 is given every outcome and Q4 only two of its three, because both are valid — an
 * outcome with no row simply has no target and is never traded.
 *
 * For a file that already carries the real numbering *and* the market's own current prices, use
 * **Export market view** on the tab: it writes exactly these three columns, so it round-trips.
 */
export const sampleZcashNu7Predictions: ZcashNu7Row[] = [
  { question: 1, outcome: 1, prediction: 0.45 },
  { question: 1, outcome: 2, prediction: 0.3 },
  { question: 1, outcome: 3, prediction: 0.15 },
  { question: 1, outcome: 4, prediction: 0.1 },
  { question: 4, outcome: 1, prediction: 0.6 },
  { question: 4, outcome: 2, prediction: 0.25 },
];
