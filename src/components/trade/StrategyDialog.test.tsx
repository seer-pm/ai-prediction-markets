import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useTradeWalletStatus", () => ({
  useTradeWalletStatus: () => ({
    account: undefined,
    tradeExecutor: undefined,
  }),
}));
vi.mock("@/hooks/useSubmitPredictions", () => ({
  useSubmitPredictions: () => ({ sign: vi.fn(), send: vi.fn() }),
  toastSubmitted: vi.fn(),
  toastSubmitFailed: vi.fn(),
}));
vi.mock("./DepositInterface", () => ({ DepositInterface: () => null }));

import { TooltipProvider } from "@/components/ui";
import { StrategyDialog } from "./StrategyDialog";

const idle = {
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
  reset: () => {},
  progress: {
    completed: [],
    skipped: [],
    onStateChange: () => {},
    reset: () => {},
  },
};

const renderDialog = (onSubmit = vi.fn()) => {
  render(
    <TooltipProvider>
      <StrategyDialog
        open
        onOpenChange={() => {}}
        title="Start trading"
        stats={[]}
        howItWorks={null}
        balance={{ value: 10n * 10n ** 18n, decimals: 18 }}
        hasPositions={false}
        mutation={idle}
        onSubmit={onSubmit}
        minAmount={{ value: "0.81", reason: "it is split across 55 markets." }}
      />
    </TooltipProvider>,
  );
  return onSubmit;
};

const typeAmount = async (value: string) => {
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value } });
  // react-hook-form validates on change, asynchronously.
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("StrategyDialog minimum amount", () => {
  afterEach(cleanup);

  it("refuses an amount under the minimum as not enough, before anything runs", async () => {
    const onSubmit = renderDialog();
    await typeAmount("0.5");
    expect(
      await screen.findAllByText(
        /Not enough to trade\. Enter at least 0\.81 sUSDS/,
      ),
    ).not.toHaveLength(0);
    const execute = screen.getByRole("button", { name: /Execute strategy/ });
    // Soft-disabled so its tooltip stays reachable: aria-disabled, and clicks do nothing.
    expect(execute.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(execute);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts the minimum", async () => {
    renderDialog();
    await typeAmount("0.81");
    expect(screen.queryByText(/Not enough to trade/)).toBeNull();
    expect(
      screen.getByRole("button", { name: /Execute strategy/ }).getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("says what the minimum is before anything is typed", () => {
    renderDialog();
    expect(screen.getByText(/Minimum 0\.81 sUSDS/)).toBeTruthy();
  });
});
