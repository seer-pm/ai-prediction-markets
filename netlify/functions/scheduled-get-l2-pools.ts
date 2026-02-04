import { Config } from "@netlify/functions";

export default async (req: Request) => {
  if (process.env.DISABLE_SCHEDULED_FUNCTIONS === "true") {
    return;
  }

  try {
    const { next_run } = await req.json();
    console.log("Received event! Next invocation at:", next_run);
    await fetch(
      process.env.GET_L2_POOLS_URL ??
        "http://deep.seer.pm/.netlify/functions/get-l2-pools-background",
    );
  } catch (e) {
    console.log(e);
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
