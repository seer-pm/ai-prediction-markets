import { useExecuteOriginalityStrategy } from "@/hooks/useExecuteOriginalityStrategy";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { OriginalityTableData } from "@/types";
import { collateral } from "@/utils/constants";
import { formatWeight } from "@/utils/format";
import React, { useMemo } from "react";
import { Address } from "viem";
import { StrategyDialog } from "./StrategyDialog";

interface TradingInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markets: OriginalityTableData[];
  tradeExecutor: Address;
  isLoadingBalances: boolean;
}

export const OriginalityTradingInterface: React.FC<TradingInterfaceProps> = ({
  open,
  onOpenChange,
  tradeExecutor,
  markets,
  isLoadingBalances,
}) => {
  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: tradeExecutor,
    token: collateral.address,
  });

  const executeTradeMutation = useExecuteOriginalityStrategy();

  // Nothing held and nothing minted means the run has no input at all.
  const hasPositions = useMemo(
    () => markets.some((m) => (m.upBalance ?? 0n) > 0n || (m.downBalance ?? 0n) > 0n),
    [markets],
  );

  const { repoCount, buyCount, sellCount, largestDelta } = useMemo(() => {
    const deltas = markets.flatMap((market) => [market.upDifference, market.downDifference]);
    const live = deltas.filter((d): d is number => !!d);
    return {
      repoCount: markets.filter((m) => m.upDifference || m.downDifference).length,
      buyCount: live.filter((d) => d > 0).length,
      sellCount: live.filter((d) => d < 0).length,
      largestDelta: live.reduce((max, d) => Math.max(max, Math.abs(d)), 0),
    };
  }, [markets]);

  return (
    <StrategyDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start trading"
      stats={[
        { label: "Repositories", value: String(repoCount) },
        { label: "To buy", value: String(buyCount), tone: "long" },
        { label: "To sell", value: String(sellCount), tone: "short" },
        { label: "Largest Δ", value: formatWeight(largestDelta) },
      ]}
      balance={balanceData}
      balanceLoading={isBalanceLoading}
      balancesLoading={isLoadingBalances}
      hasPositions={hasPositions}
      mutation={executeTradeMutation}
      blockedReason={
        repoCount === 0
          ? "Every prediction already matches the market — there is nothing to trade."
          : undefined
      }
      onSubmit={(value) =>
        executeTradeMutation.mutate({ amount: value, tableData: markets, tradeExecutor })
      }
      howItWorks={
        <>
          <p className="mb-2">
            Each repository trades as a scalar pair, so UP and DOWN always sum to one.
          </p>
          <ol className="list-inside list-decimal space-y-1.5 marker:font-medium marker:text-ink-3">
            <li>Mint complete sets of the parent market with the sUSDS you supply.</li>
            <li>Sell overvalued outcomes, never below the fair value your prediction implies.</li>
            <li>
              Per repository, either buy the undervalued side outright, or mint the UP/DOWN pair,
              sell the overvalued side and buy the undervalued one.
            </li>
          </ol>
        </>
      }
    />
  );
};
