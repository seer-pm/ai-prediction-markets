import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);
const AI_PREDICTION_MARKET_ID = "0xb88275fe4e2494e04cea8fb5e9d913aa48add581";

export default async () => {
  try {
    const { data, error } = await supabase
      .from("markets")
      .select("*")
      .eq("id", AI_PREDICTION_MARKET_ID)
      .single();
    if (error) {
      throw error;
    }
    const {
      subgraph_data: { outcomes },
      odds,
    } = data;
    const repoToPriceMapping = (outcomes as string[]).reduce((mapping, outcome, index) => {
      if (outcome !== "Invalid result") {
        mapping[`https://github.com/${outcome}`] = Number(odds[index]) / 100;
      }
      return mapping;
    }, {} as { [key: string]: number });
    return new Response(JSON.stringify({ ...repoToPriceMapping }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
};
