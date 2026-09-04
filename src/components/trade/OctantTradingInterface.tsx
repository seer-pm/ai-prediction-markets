import useDebounce from "@/hooks/useDebounce";
import { useExecuteOctantTradeStrategy } from "@/hooks/useExecuteOctantTradeStrategy";
import { useGetOctantQuotes } from "@/hooks/useGetOctantQuotes";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { TableData } from "@/types";
import { collateral } from "@/utils/constants";
import { formatPercent } from "@/utils/format";
import React, { useMemo, useState } from "react";
import { Address } from "viem";
import { StrategyDialog } from "./StrategyDialog";

interface TradingInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: TableData[];
  tradeExecutor: Address;
  isLoadingBalances: boolean;
}

export const OctantTradingInterface: React.FC<TradingInterfaceProps> = ({
  open,
  onOpenChange,
  tradeExecutor,
  rows,
  isLoadingBalances,
}) => {
  const [amount, setAmount] = useState("");
  const debouncedAmount = useDebounce(amount, 300);
  // The debounce means the quotes on hand can belong to a previous amount.
  const quotesStale = amount !== debouncedAmount;

  const {
    data: getQuotesResult,
    isLoading: isLoadingQuotes,
    error: errorGettingQuotes,
    progress: quoteProgress,
  } = useGetOctantQuotes({ account: tradeExecutor, amount: debouncedAmount, tableData: rows });

  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: tradeExecutor,
    token: collateral.address,
  });

  const executeTradeMutation = useExecuteOctantTradeStrategy();

  // Nothing held and nothing minted means the run has no input at all.
  const hasPositions = useMemo(() => rows.some((row) => (row.balance ?? 0n) > 0n), [rows]);

  const { buyCount, sellCount, largestDelta } = useMemo(() => {
    const deltas = rows.map((row) => row.difference).filter((d): d is number => !!d);
    return {
      buyCount: deltas.filter((d) => d > 0).length,
      sellCount: deltas.filter((d) => d < 0).length,
      largestDelta: deltas.reduce((max, d) => Math.max(max, Math.abs(d)), 0) * 100,
    };
  }, [rows]);

  return (
    <StrategyDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start trading"
      stats={[
        { label: "Projects", value: String(buyCount + sellCount) },
        { label: "To buy", value: String(buyCount), tone: "long" },
        { label: "To sell", value: String(sellCount), tone: "short" },
        { label: "Largest Δ", value: `${formatPercent(largestDelta)}%` },
      ]}
      balance={balanceData}
      balanceLoading={isBalanceLoading}
      balancesLoading={isLoadingBalances}
      hasPositions={hasPositions}
      quotesLoading={isLoadingQuotes}
      quotesProgress={{ step: quoteProgress ?? 0, of: rows.filter((r) => r.difference).length }}
      quotesError={errorGettingQuotes}
      mutation={executeTradeMutation}
      onAmountChange={setAmount}
      blockedReason={
        quotesStale
          ? "Pricing the new amount…"
          : buyCount + sellCount === 0
          ? "Every prediction already matches the market — there is nothing to trade."
          : !getQuotesResult
            ? "No quotes are available for these markets."
            : undefined
      }
      onSubmit={(value) =>
        executeTradeMutation.mutate({
          amount: value,
          getQuotesResult,
          tradeExecutor,
          tableData: rows,
        })
      }
      howItWorks={
        <ol className="list-inside list-decimal space-y-1.5 marker:font-medium marker:text-ink-3">
          <li>Mint complete sets of the market with the sUSDS you supply.</li>
          <li>Sell projects trading above your predicted share, down to that share.</li>
          <li>Merge whatever complete sets remain back into sUSDS.</li>
          <li>Spend the proceeds buying projects trading below your predicted share.</li>
        </ol>
      }
    />
  );
};
