import { AI_PREDICTION_MARKET_ID } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { compareAsc, fromUnixTime } from "date-fns";
import { Address } from "viem";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

enum MarketStatus {
  NOT_OPEN = "not_open",
  OPEN = "open",
  ANSWER_NOT_FINAL = "answer_not_final",
  IN_DISPUTE = "in_dispute",
  PENDING_EXECUTION = "pending_execution",
  CLOSED = "closed",
}

interface Market {
  payoutReported: boolean;
  wrappedTokens: Address[];
  conditionId: Address;
  questions: {
    question: { opening_ts: string; finalize_ts: string; is_pending_arbitration: boolean };
  }[];
}

const getMarketStatus = (market: Market) => {
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

  if (!market!.payoutReported) {
    return MarketStatus.PENDING_EXECUTION;
  }

  return MarketStatus.CLOSED;
};

export default async () => {
  try {
    const { data, error } = await supabase
      .from("markets")
      .select(
        "subgraph_data->payoutReported,subgraph_data->conditionId,subgraph_data->wrappedTokens,subgraph_data->questions"
      )
      .eq("id", AI_PREDICTION_MARKET_ID)
      .single();
    if (!data) {
      throw { message: "Market not found" };
    }
    if (error) {
      throw error;
    }
    const isRedeemable = getMarketStatus(data as Market) === MarketStatus.CLOSED;

    return new Response(JSON.stringify({ isRedeemable }), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "http://localhost:5173",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  } catch (e: any) {
    console.log(e);
    return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
};
