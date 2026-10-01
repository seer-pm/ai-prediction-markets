import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every contest panel needs a wallet and live data. The tab bar is what is under test, so each
// panel is a marker saying which contest it stands for.
vi.mock("./tabs/AiMarkets", () => ({ AiMarkets: () => <div>panel:round1</div> }));
vi.mock("./tabs/L1Markets", () => ({ L1Markets: () => <div>panel:round2-l1</div> }));
vi.mock("./tabs/L2Markets", () => ({ L2Markets: () => <div>panel:round2-l2</div> }));
vi.mock("./tabs/OctantMarkets", () => ({ OctantMarkets: () => <div>panel:octant</div> }));
vi.mock("./tabs/ZcashMarkets", () => ({ ZcashMarkets: () => <div>panel:zcash</div> }));
vi.mock("./tabs/ZcashNu7Markets", () => ({ ZcashNu7Markets: () => <div>panel:zcash-nu7</div> }));
vi.mock("./tabs/OriginalityMarkets", () => ({
  OriginalityMarkets: () => <div>panel:round2</div>,
  OriginalityR3Markets: () => <div>panel:round3</div>,
  OriginalityR3IncorrectMarkets: () => <div>panel:round3-incorrect</div>,
}));

import { useContestTabStore } from "@/stores/contestTabStore";
import { Tab } from "./Tab";

beforeEach(() => {
  window.localStorage.clear();
  useContestTabStore.setState({ requestedTab: null });
});
afterEach(cleanup);

describe("Tab", () => {
  it("opens on the corrected Round 3", () => {
    render(<Tab />);
    expect(screen.getByText("panel:round3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Round 3 · Originality/ })).toBeTruthy();
  });

  it("does not mention the incorrect set anywhere", () => {
    const { container } = render(<Tab />);
    expect(container.textContent).not.toMatch(/incorrect|withdraw|relaunch/i);
    expect(screen.queryByText("panel:round3-incorrect")).toBeNull();
  });

  it("marks every live tab as live", () => {
    render(<Tab />);
    const live = screen
      .getAllByRole("button")
      .filter((button) => (button.textContent ?? "").endsWith("Live"));
    expect(live.map((button) => button.textContent)).toEqual([
      "Round 3 · OriginalityLive",
      "Zcash · GrantsLive",
    ]);
  });

  it("falls back to Round 3 for someone whose last tab was the incorrect set", () => {
    window.localStorage.setItem("active-contest", JSON.stringify("round3-incorrect"));
    render(<Tab />);
    expect(screen.getByText("panel:round3")).toBeTruthy();
    expect(screen.queryByText("panel:round3-incorrect")).toBeNull();
  });

  it("ignores a request to open the incorrect set", () => {
    useContestTabStore.setState({ requestedTab: "round3-incorrect" });
    render(<Tab />);
    expect(screen.queryByText("panel:round3-incorrect")).toBeNull();
    expect(screen.getByText("panel:round3")).toBeTruthy();
    expect(useContestTabStore.getState().requestedTab).toBeNull();
  });

  it("still opens a contest another part of the app asks for", async () => {
    useContestTabStore.setState({ requestedTab: "zcash" });
    render(<Tab />);
    expect(await screen.findByText("panel:zcash")).toBeTruthy();
  });
});
