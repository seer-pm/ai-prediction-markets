import { L2QuoteProps } from "@/types";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export default async (req: Request) => {
  const body = (await req.json()) as L2QuoteProps;

  const { data } = await supabase
    .from("l2_quote_runs")
    .insert({
      input: body,
    })
    .select()
    .single();

  fetch(`https://deep.seer.pm/.netlify/functions/l2-quotes-background`, {
    method: "POST",
    body: JSON.stringify({ runId: data.id }),
  });

  return Response.json({ runId: data.id });
};
