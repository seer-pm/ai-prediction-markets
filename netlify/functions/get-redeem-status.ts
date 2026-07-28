import { AI_PREDICTION_MARKET_ID } from "@/utils/constants";
import { getCorsHeaders, handleCorsPreflight } from "./utils/cors";
import { getMarketStatus, MarketStatusInput } from "./utils/marketStatus";
import { MarketStatus } from "@seer-pm/sdk";
import { createClient } from "@supabase/supabase-js";
import { Address } from "viem";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);


interface Market extends MarketStatusInput {
  wrappedTokens: Address[];
  conditionId: Address;
}

export default async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);
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
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (e: any) {
    console.log(e);
    return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }
};
