import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const scan = vi.hoisted(() => ({
  account: "0x00000000000000000000000000000000000000a1",
  executor: "0x00000000000000000000000000000000000000e1",
  held: {} as Record<string, boolean>,
}));

vi.mock("wagmi", () => ({ useAccount: () => ({ address: scan.account }) }));
vi.mock("@/hooks/useCheckTradeExecutorCreated", () => ({
  useCheckNewTradeExecutorCreated: () => ({
    data: { isCreated: true, predictedAddress: scan.executor },
  }),
  useCheckOldTradeExecutorCreated: () => ({ data: undefined }),
}));
vi.mock("@/hooks/useRedeemableScan", () => ({
  useRedeemableScan: () => ({
    data: { checkedAt: 0, executors: [scan.executor], wallets: { [scan.executor]: scan.held } },
  }),
}));

import { UnclaimedPayouts } from "./UnclaimedPayouts";

afterEach(cleanup);

describe("UnclaimedPayouts", () => {
  it("lists a settled contest the wallet still holds", () => {
    scan.held = { round2: true };
    render(<UnclaimedPayouts onOpenMarkets={() => {}} />);
    expect(screen.getByText("Round 2 · Originality")).toBeTruthy();
  });

  it("gives the incorrect Round 3 set no row, even when the wallet holds a claim in it", () => {
    scan.held = { round2: true, "round3-incorrect": true };
    const { container } = render(<UnclaimedPayouts onOpenMarkets={() => {}} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/incorrect/i);
  });

  it("renders nothing when the incorrect set is the only claim", () => {
    scan.held = { "round3-incorrect": true };
    const { container } = render(<UnclaimedPayouts onOpenMarkets={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});
