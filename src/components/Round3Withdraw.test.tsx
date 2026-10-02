import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ORIGINALITY_R3_PARENT_MARKET_ID } from "@/utils/originalityR3Markets";

// The market view needs a wallet and live data; what is under test here is the page around it.
vi.mock("@/components/tabs/OriginalityMarkets", () => ({
  OriginalityR3IncorrectMarkets: () => <div data-testid="incorrect-markets" />,
}));

import { Round3Withdraw, Round3WithdrawNotice } from "./Round3Withdraw";

afterEach(cleanup);

describe("Round3WithdrawNotice", () => {
  it("says the set is incorrect and how to get out", () => {
    render(<Round3WithdrawNotice onOpenRound3={() => {}} />);
    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("This market set is incorrect — withdraw your funds");
    expect(notice.textContent).toContain("use Withdraw below");
    expect(notice.textContent).toContain("move the sUSDS out of your trade wallet");
  });

  it("says a loss is reimbursed and a profit is kept", () => {
    render(<Round3WithdrawNotice onOpenRound3={() => {}} />);
    const text = screen.getByRole("alert").textContent;
    expect(text).toContain("If you made a loss trading these markets, it will be reimbursed.");
    expect(text).toContain("If you made a profit, it is yours to keep, for the inconvenience.");
  });

  it("says pairs are merged at full value, and the remainder is redeemable later", () => {
    render(<Round3WithdrawNotice onOpenRound3={() => {}} />);
    const text = screen.getByRole("alert").textContent;
    expect(text).toContain("merged back at full value and only the rest is sold");
    expect(text).toContain("becomes redeemable here when this market resolves");
  });

  it("sends people on to the corrected Round 3", () => {
    const onOpenRound3 = vi.fn();
    render(<Round3WithdrawNotice onOpenRound3={onOpenRound3} />);
    fireEvent.click(screen.getByRole("button", { name: "Go to the corrected Round 3" }));
    expect(onOpenRound3).toHaveBeenCalledTimes(1);
  });

  it("links the incorrect parent market on Seer, in a new tab", () => {
    render(<Round3WithdrawNotice onOpenRound3={() => {}} />);
    const link = screen.getByRole("link", { name: /The incorrect market on Seer/ });
    expect(link.getAttribute("href")).toBe(
      `https://app.seer.pm/markets/10/${ORIGINALITY_R3_PARENT_MARKET_ID}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("Round3Withdraw", () => {
  it("puts the notice above the incorrect set's markets", () => {
    render(<Round3Withdraw onOpenRound3={() => {}} />);
    const notice = screen.getByRole("alert");
    const markets = screen.getByTestId("incorrect-markets");
    expect(notice.compareDocumentPosition(markets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
