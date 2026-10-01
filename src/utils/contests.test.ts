import { describe, expect, it } from "vitest";
import { DEEP_CONTESTS, LEADERBOARD_CONTESTS, TAB_CONTESTS, getContest, type Contest } from "./contests";
import { ORIGINALITY_R3_PARENT_MARKET_ID } from "./originalityR3Markets";
import { ORIGINALITY_R3_V3_MARKET_IDS } from "./originalityR3V3Markets";
import { ORIGINALITY_ROUND_3, ORIGINALITY_ROUND_3_INCORRECT } from "./originalityRounds";

const ids = (contests: readonly Contest[]) => contests.map((contest) => contest.id);

describe("the incorrect Round 3 set", () => {
  it("is still registered, so its withdraw page and redeem scan keep working", () => {
    const contest = getContest("round3-incorrect");
    expect(contest?.incorrect).toBe(true);
    expect(contest?.marketId).toBe(ORIGINALITY_R3_PARENT_MARKET_ID);
    // Not finished: that would close "Sell all positions".
    expect(contest?.finished).toBe(false);
  });

  it("is in neither the tab bar nor the leaderboard", () => {
    expect(ids(TAB_CONTESTS)).not.toContain("round3-incorrect");
    expect(ids(LEADERBOARD_CONTESTS)).not.toContain("round3-incorrect");
  });

  it("is the only contest left out of the tab bar", () => {
    const missing = ids(DEEP_CONTESTS).filter((id) => !ids(TAB_CONTESTS).includes(id));
    expect(missing).toEqual(["round3-incorrect"]);
  });

  it("is not named in any label the app shows", () => {
    for (const { label } of [...TAB_CONTESTS, ...LEADERBOARD_CONTESTS]) {
      expect(label).not.toMatch(/incorrect|withdraw/i);
    }
  });
});

describe("the corrected Round 3", () => {
  it("is the live Round 3 tab, over the corrected markets", () => {
    const contest = getContest("round3") as Contest;
    expect(contest.finished).toBe(false);
    expect(contest.incorrect).toBeUndefined();
    expect(contest.marketIds).toBe(ORIGINALITY_R3_V3_MARKET_IDS);
    expect(ids(TAB_CONTESTS)[0]).toBe("round3");
  });

  it("carries nothing that points at the incorrect set", () => {
    expect(ORIGINALITY_ROUND_3.incorrect).toBeUndefined();
    expect(JSON.stringify(ORIGINALITY_ROUND_3)).not.toMatch(/incorrect/i);
    expect(ORIGINALITY_ROUND_3.eyebrow).toBe("Round 3 · Originality");
  });

  it("is where the withdraw page sends people back to", () => {
    expect(ORIGINALITY_ROUND_3_INCORRECT.incorrect?.replacedBy).toBe("round3");
    expect(ids(TAB_CONTESTS)).toContain(ORIGINALITY_ROUND_3_INCORRECT.incorrect?.replacedBy);
  });

  it("does not share a parent or a data function with the incorrect set", () => {
    expect(ORIGINALITY_ROUND_3.parentMarketId).not.toBe(ORIGINALITY_ROUND_3_INCORRECT.parentMarketId);
    expect(ORIGINALITY_ROUND_3.dataFunction).not.toBe(ORIGINALITY_ROUND_3_INCORRECT.dataFunction);
    expect(ORIGINALITY_ROUND_3.queryKey).not.toEqual(ORIGINALITY_ROUND_3_INCORRECT.queryKey);
  });
});
