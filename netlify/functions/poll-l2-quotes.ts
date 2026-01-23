import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

export default async (req: Request) => {
  try {
    const { runId } = await req.json();

    if (!runId) {
      return Response.json({ error: "runId is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("l2_quote_runs")
      .select("status, result, error, created_at, finished_at")
      .eq("id", runId)
      .single();

    if (error || !data) {
      return Response.json({ error: "Run not found" }, { status: 404 });
    }

    return Response.json({
      status: data.status, // running | done | error
      result: data.result ?? [],
      error: data.error ?? null,
      done: data.status === "done",
    });
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
};
