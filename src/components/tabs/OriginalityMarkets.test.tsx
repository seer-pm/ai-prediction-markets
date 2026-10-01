import { cleanup, fireEvent, render as renderBare, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The view under test is the layout: which of chart, predictions bar, table and buttons a round
 * gets. Everything that reads a wallet or the network is replaced by a value the test sets.
 */
const state = vi.hoisted(() => ({
  wallet: {} as Record<string, unknown>,
  rows: [] as Array<Record<string, unknown>>,
  isLoading: false,
  marketData: {} as Record<string, unknown>,
  balances: [] as bigint[],
  chartIds: [] as Array<string[] | undefined>,
  sellAll: vi.fn(),
}));

vi.mock("@/hooks/useTradeWalletStatus", () => ({ useTradeWalletStatus: () => state.wallet }));
vi.mock("@/hooks/useProcessOriginalityPredictions", () => ({
  useProcessOriginalityPredictions: () => ({
    data: state.rows,
    isLoading: state.isLoading,
    isLoadingBalances: false,
    error: null,
    marketIdToRepo: { "0xmarket": "a16z/helios" },
  }),
}));
vi.mock("@/hooks/useMarketCharts", () => ({
  chartLiquidity: () => undefined,
  chartVolume: () => undefined,
  liveSeries: () => undefined,
  useMarketCharts: (ids: string[] | undefined) => {
    state.chartIds.push(ids);
    return { data: undefined, isLoading: false, error: null };
  },
}));
vi.mock("@/hooks/useOriginalityMarketsData", () => ({
  useOriginalityMarketsData: () => ({ data: state.marketData }),
}));
vi.mock("@/hooks/useTokensBalances", () => ({
  useTokensBalances: (_account: unknown, tokens: unknown[] | undefined) => ({
    data: tokens?.length ? state.balances : [],
    isLoading: false,
  }),
}));
const idle = { isError: false, error: null, isPending: false, isSuccess: false, progress: undefined, reset: () => {} };
vi.mock("@/hooks/useSellToCollateral", () => ({
  useSellToCollateral: () => ({ ...idle, mutate: state.sellAll }),
}));
vi.mock("@/hooks/useRedeemOriginality", () => ({
  useRedeemOriginality: () => ({ ...idle, mutate: vi.fn() }),
}));

// Reads the sUSDS rate through wagmi, which would start a wallet client.
vi.mock("@/components/contest/FigureLabel", () => ({ FigureLabel: () => null }));
vi.mock("@/components/contest/ContestChart", () => ({ ContestChart: () => <div>the chart</div> }));
vi.mock("@/components/OriginalityMarketTable", () => ({
  OriginalityMarketTable: () => <div>the table</div>,
}));
vi.mock("@/components/predictions/PredictionDropzone", () => ({ PredictionDropzone: () => null }));
vi.mock("../GenericCSVUpload", () => ({ GenericCSVUpload: () => null }));
vi.mock("@/components/trade/OriginalityTradingInterface", () => ({
  OriginalityTradingInterface: () => null,
}));
vi.mock("../trade/WithdrawOutcomeTokensInterface", () => ({
  WithdrawOutcomeTokensInterface: () => null,
}));
vi.mock("../trade/RedeemL2Interface", () => ({ RedeemL2Interface: () => null }));
vi.mock("../trade/SellAllTokensInterface", () => ({
  SellAllTokensInterface: ({ open, onSellAll }: { open: boolean; onSellAll: () => void }) =>
    open ? <button onClick={onSellAll}>confirm sell all</button> : null,
}));

import { TooltipProvider } from "@/components/ui";
import { ORIGINALITY_ROUND_3_INCORRECT } from "@/utils/originalityRounds";
import { OriginalityR3IncorrectMarkets, OriginalityR3Markets } from "./OriginalityMarkets";

const ACCOUNT = "0x00000000000000000000000000000000000000a1";
const EXECUTOR = "0x00000000000000000000000000000000000000e1";
const HELD_ROW = { repo: "a16z/helios", collateralToken: "0xc0", upBalance: 5n, downBalance: 0n };

const connected = {
  account: ACCOUNT,
  tradeExecutor: EXECUTOR,
  canTrade: true,
  isCreated: true,
  isUseOldWallet: false,
};
// A disabled button explains itself in a tooltip, which needs the app's provider.
const render = (ui: ReactElement) => renderBare(<TooltipProvider>{ui}</TooltipProvider>);
const buttons = () => screen.queryAllByRole("button").map((button) => button.textContent);

beforeEach(() => {
  window.localStorage.clear();
  state.wallet = connected;
  state.rows = [HELD_ROW];
  state.isLoading = false;
  state.marketData = { markets: [], parentWrappedTokens: [], parentMarketStatus: "open" };
  state.balances = [];
  state.chartIds = [];
  state.sellAll.mockReset();
});
afterEach(cleanup);

describe("the incorrect Round 3 set (withdraw page)", () => {
  it("shows only the Sell all button to someone holding positions", () => {
    render(<OriginalityR3IncorrectMarkets />);
    expect(buttons()).toEqual(["Sell all positions"]);
    expect(screen.getByText("You hold positions in these markets.")).toBeTruthy();
  });

  it("has no chart, no table and no predictions upload", () => {
    const { container } = render(<OriginalityR3IncorrectMarkets />);
    expect(screen.queryByText("the chart")).toBeNull();
    expect(screen.queryByText("the table")).toBeNull();
    expect(container.textContent).not.toMatch(/prediction|upload|export|withdraw tokens|start trading/i);
  });

  it("does not fetch chart history it will not draw", () => {
    render(<OriginalityR3IncorrectMarkets />);
    expect(state.chartIds.every((ids) => ids === undefined)).toBe(true);
  });

  it("sells against the incorrect set's own parent", () => {
    render(<OriginalityR3IncorrectMarkets />);
    fireEvent.click(screen.getByRole("button", { name: "Sell all positions" }));
    fireEvent.click(screen.getByRole("button", { name: "confirm sell all" }));
    expect(state.sellAll).toHaveBeenCalledTimes(1);
    expect(state.sellAll.mock.calls[0][0]).toMatchObject({
      tradeExecutor: EXECUTOR,
      parentMarketId: ORIGINALITY_ROUND_3_INCORRECT.parentMarketId,
      parentInvalidToken: ORIGINALITY_ROUND_3_INCORRECT.parentInvalidToken,
      middleMarkets: undefined,
    });
  });

  it("disables Sell all and says so when the wallet holds nothing", () => {
    state.rows = [{ ...HELD_ROW, upBalance: 0n }];
    render(<OriginalityR3IncorrectMarkets />);
    // Soft-disabled, so its reason stays reachable: `aria-disabled`, and a click does nothing.
    const sell = screen.getByRole("button", { name: "Sell all positions" });
    expect(sell.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(sell);
    expect(screen.queryByRole("button", { name: "confirm sell all" })).toBeNull();
    expect(screen.getByText("You hold no positions in these markets.")).toBeTruthy();
  });

  it("offers Redeem once the set has resolved and the wallet holds a payout", () => {
    state.rows = [{ ...HELD_ROW, upBalance: 0n }];
    state.marketData = { markets: [], parentWrappedTokens: ["0xp1", "0xp2"], parentMarketStatus: "closed" };
    state.balances = [3n, 0n];
    render(<OriginalityR3IncorrectMarkets />);
    expect(buttons()).toEqual(["Sell all positions", "Redeem to sUSDS"]);
    expect(screen.getByText("You hold a payout from these markets.")).toBeTruthy();
  });

  it("does not offer Redeem before the set has resolved, whatever the wallet holds", () => {
    state.marketData = { markets: [], parentWrappedTokens: ["0xp1", "0xp2"], parentMarketStatus: "open" };
    state.balances = [3n, 0n];
    render(<OriginalityR3IncorrectMarkets />);
    expect(buttons()).toEqual(["Sell all positions"]);
  });

  it("asks a visitor with no wallet to connect, and offers no buttons", () => {
    state.wallet = { account: undefined, tradeExecutor: undefined, canTrade: false, isCreated: false, isUseOldWallet: false };
    render(<OriginalityR3IncorrectMarkets />);
    expect(buttons()).toEqual([]);
    expect(screen.getByText("Connect the wallet you traded with to see your positions.")).toBeTruthy();
  });

  it("tells a wallet with no trade wallet that it holds nothing", () => {
    state.wallet = { ...connected, tradeExecutor: undefined, canTrade: false, isCreated: false };
    render(<OriginalityR3IncorrectMarkets />);
    expect(buttons()).toEqual([]);
    expect(screen.getByText(/has no trade wallet/)).toBeTruthy();
  });

  it("says it is still reading rather than claiming the wallet is empty", () => {
    state.rows = [];
    state.isLoading = true;
    render(<OriginalityR3IncorrectMarkets />);
    expect(screen.getByText("Reading your positions…")).toBeTruthy();
    expect(screen.queryByText("You hold no positions in these markets.")).toBeNull();
  });
});

describe("the corrected Round 3 tab", () => {
  it("keeps its chart, table and full set of actions", () => {
    render(<OriginalityR3Markets />);
    expect(screen.getByText("the chart")).toBeTruthy();
    expect(screen.getByText("the table")).toBeTruthy();
    expect(buttons()).toEqual([
      "Upload predictions",
      "Withdraw tokens",
      "Sell all positions",
      "Start trading",
    ]);
  });

  it("asks for its chart history", () => {
    render(<OriginalityR3Markets />);
    expect(state.chartIds.at(-1)).toEqual(["0xmarket"]);
  });
});
