import { describe, expect, it } from "vitest";
import { getContest } from "./contests";
import { parseZcashCSV, splitCsvLine } from "./csvParser";
import { getZcashRoundMarketByTitle, sampleZcashRoundPredictions, ZCASH_ROUNDS } from "./zcashRounds";

describe("Zcash grants rounds", () => {
  it("Round 2 is the 55-market Q4 ballot, registered as its own contest", () => {
    const { markets } = ZCASH_ROUNDS["zcash-q4"];
    expect(markets).toHaveLength(55);
    expect(new Set(markets.map((m) => m.address.toLowerCase())).size).toBe(55);
    expect(new Set(markets.map((m) => m.title.toLowerCase())).size).toBe(55);
    expect(markets.reduce((sum, m) => sum + m.requestedUsd, 0)).toBe(5_867_425);
    expect(getContest("zcash-q4")?.marketIds).toEqual(markets.map((m) => m.address));
  });

  it("keeps the two ballots apart", () => {
    expect(getZcashRoundMarketByTitle("zcash-q4", "ShieldedScan")?.id).toBe(42);
    expect(getZcashRoundMarketByTitle("zcash", "ShieldedScan")?.id).toBe(2);
    expect(getZcashRoundMarketByTitle("zcash", "Token Holder Voting")).toBeUndefined();
  });

  it("splits a quoted cell with a comma in it", () => {
    expect(splitCsvLine('"Zallet Deadlock Fix, Reliability Fixes and zcashd RPC Parity",0.4')).toEqual([
      "Zallet Deadlock Fix, Reliability Fixes and zcashd RPC Parity",
      "0.4",
    ]);
    expect(splitCsvLine('"say ""hi""",1')).toEqual(['say "hi"', "1"]);
    expect(splitCsvLine("plain,0.5")).toEqual(["plain", "0.5"]);
  });

  it("reads back every Round 2 title when the sample is written the way downloadCsv writes it", () => {
    const quote = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [
      "project,probability",
      ...sampleZcashRoundPredictions("zcash-q4").map((row) => `${quote(row.project)},${row.probability}`),
    ].join("\n");
    const rows = parseZcashCSV(csv, "zcash-q4");
    expect(rows).toHaveLength(55);
    expect(rows.map((r) => r.project)).toEqual(ZCASH_ROUNDS["zcash-q4"].markets.map((m) => m.title));
  });

  it("refuses a Q3 title on the Q4 ballot, naming the poll", () => {
    expect(() => parseZcashCSV("project,probability\nZcash Grants Hub,0.5", "zcash-q4")).toThrow(/Q4 2026 ballot/);
  });
});
