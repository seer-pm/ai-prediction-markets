import { MarketStatus } from "@seer-pm/sdk";
import { compareAsc, fromUnixTime } from "date-fns";

/** The subset of a market's subgraph_data that the status derivation needs. */
export interface MarketStatusInput {
  payoutReported: boolean;
  questions: {
    question: { opening_ts: string; finalize_ts: string; is_pending_arbitration: boolean };
  }[];
}

export const getMarketStatus = (market: MarketStatusInput) => {
  // A market with no questions yet can't be open — treat it as not open rather
  // than reading questions[0] off an empty array.
  if (!market.questions?.length) {
    return MarketStatus.NOT_OPEN;
  }

  if (!(Number(market.questions[0].question.opening_ts) < Math.round(new Date().getTime() / 1000))) {
    return MarketStatus.NOT_OPEN;
  }

  if (market.questions.every((question) => Number(question.question.finalize_ts) === 0)) {
    return MarketStatus.OPEN;
  }

  if (market.questions.some((question) => question.question.is_pending_arbitration)) {
    return MarketStatus.IN_DISPUTE;
  }

  if (
    market.questions.some((question) => {
      const finalizeTs = Number(question.question.finalize_ts);
      const isFinalized =
        !question.question.is_pending_arbitration &&
        finalizeTs > 0 &&
        compareAsc(new Date(), fromUnixTime(finalizeTs)) === 1;
      return finalizeTs === 0 || !isFinalized;
    })
  ) {
    return MarketStatus.ANSWER_NOT_FINAL;
  }

  if (!market.payoutReported) {
    return MarketStatus.PENDING_EXECUTION;
  }

  return MarketStatus.CLOSED;
};
