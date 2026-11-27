import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useTradeWalletStatus", () => ({
  useTradeWalletStatus: () => ({ account: undefined, tradeExecutor: undefined }),
}));
vi.mock("@/hooks/useSubmitPredictions", () => ({
  useSubmitPredictions: () => ({ sign: vi.fn(), send: vi.fn() }),
  toastSubmitted: vi.fn(),
  toastSubmitFailed: vi.fn(),
}));
vi.mock("./DepositInterface", () => ({ DepositInterface: () => null }));

import { TooltipProvider } from "@/components/ui";
import { SkippedMarketsNotice } from "./SkippedMarketsNotice";
import { StrategyDialog } from "./StrategyDialog";

const RETRY = "Run the strategy again to retry them.";

describe("SkippedMarketsNotice", () => {
  afterEach(cleanup);

  it("names every market that was not traded", () => {
    render(<SkippedMarketsNotice markets={["VIZOR", "NOZY", "ZecHub Bounty"]} retry={RETRY} />);
    expect(screen.getByText("3 markets were not traded")).toBeTruthy();
    for (const name of ["VIZOR", "NOZY", "ZecHub Bounty"]) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByText(RETRY)).toBeTruthy();
  });

  it("reports calls taken out of a batch", () => {
    render(<SkippedMarketsNotice markets={[]} prunedCalls={2} retry={RETRY} />);
    expect(screen.getByText("2 calls were left out")).toBeTruthy();
    expect(screen.getByText(/would have failed on chain/)).toBeTruthy();
  });

  it("says nothing when the run left nothing out", () => {
    const { container } = render(<SkippedMarketsNotice markets={[]} prunedCalls={0} retry={RETRY} />);
    expect(container.textContent).toBe("");
  });

  it("shows under the result once the strategy has run", () => {
    render(
      <TooltipProvider>
        <StrategyDialog
          open
          onOpenChange={() => {}}
          title="Start trading"
          stats={[]}
          howItWorks={null}
          balance={{ value: 10n ** 18n, decimals: 18 }}
          hasPositions
          minAmount={undefined}
          mutation={{
            isPending: false,
            isError: false,
            isSuccess: true,
            error: null,
            reset: () => {},
            progress: { completed: [], skipped: [], onStateChange: () => {}, reset: () => {} },
          }}
          onSubmit={() => {}}
          runNotice={<SkippedMarketsNotice markets={["VIZOR"]} retry={RETRY} />}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Strategy executed")).toBeTruthy();
    expect(screen.getByText("1 market was not traded")).toBeTruthy();
  });
});
