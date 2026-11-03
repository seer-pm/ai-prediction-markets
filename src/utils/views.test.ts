import { describe, expect, it } from "vitest";
import { PATHS, RECOVER_POSITIONS_PATH, ROUND3_WITHDRAW_PATH, viewFromPath } from "./views";

describe("viewFromPath", () => {
  it("maps each view's own path back to it", () => {
    for (const [view, path] of Object.entries(PATHS)) {
      expect(viewFromPath(path)).toBe(view);
    }
  });

  it("opens the withdraw page from its link, whatever the casing or trailing slash", () => {
    expect(ROUND3_WITHDRAW_PATH).toBe("/round3-withdraw");
    expect(viewFromPath("/round3-withdraw")).toBe("round3-withdraw");
    expect(viewFromPath("/round3-withdraw/")).toBe("round3-withdraw");
    expect(viewFromPath("/Round3-Withdraw")).toBe("round3-withdraw");
  });

  it("opens the recovery page from its link", () => {
    expect(RECOVER_POSITIONS_PATH).toBe("/recover-positions");
    expect(viewFromPath("/recover-positions/")).toBe("recover-positions");
    expect(viewFromPath("/Recover-Positions")).toBe("recover-positions");
  });

  it("keeps the leaderboard path working", () => {
    expect(viewFromPath("/leaderboard")).toBe("leaderboard");
    expect(viewFromPath("/leaderboard/")).toBe("leaderboard");
  });

  it("falls back to the markets for anything else", () => {
    expect(viewFromPath("/")).toBe("markets");
    expect(viewFromPath("")).toBe("markets");
    expect(viewFromPath("/round3")).toBe("markets");
    expect(viewFromPath("/round3-withdraw/extra")).toBe("markets");
  });

  it("gives every view a distinct path", () => {
    const paths = Object.values(PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
