import useDebounce from "@/hooks/useDebounce";
import { useExecuteL2Strategy } from "@/hooks/useExecuteL2Strategy";
import { useGetL2Quotes } from "@/hooks/useGetL2Quotes";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { L2TableData } from "@/types";
import { collateral } from "@/utils/constants";
import { formatWeight } from "@/utils/format";
import React, { useMemo, useState } from "react";
import { Address } from "viem";
import { StrategyDialog } from "./StrategyDialog";

interface TradingInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: L2TableData[];
  tradeExecutor: Address;
  isLoadingBalances: boolean;
}

export const L2TradingInterface: React.FC<TradingInterfaceProps> = ({
  open,
  onOpenChange,
  tradeExecutor,
  rows,
  isLoadingBalances,
}) => {
  const [amount, setAmount] = useState("");
  const debouncedAmount = useDebounce(amount, 500);
  // The debounce means the quotes on hand can belong to a previous amount.
  const quotesStale = amount !== debouncedAmount;

  const {
    data: getQuotesResults,
    isLoading: isLoadingQuotes,
    error: errorGettingQuotes,
    progress: quoteProgress,
  } = useGetL2Quotes({ account: tradeExecutor, amount: debouncedAmount, tableData: rows });

  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: tradeExecutor,
    token: collateral.address,
  });

  const executeTradeMutation = useExecuteL2Strategy();

  // Nothing held and nothing minted means the run has no input at all.
  const hasPositions = useMemo(() => rows.some((row) => (row.balance ?? 0n) > 0n), [rows]);

  const { buyCount, sellCount, marketCount, largestDelta } = useMemo(() => {
    const tradable = rows.filter((row) => row.difference);
    return {
      marketCount: new Set(tradable.map((row) => row.marketId)).size,
      buyCount: tradable.filter((row) => (row.difference ?? 0) > 0).length,
      sellCount: tradable.filter((row) => (row.difference ?? 0) < 0).length,
      largestDelta: tradable.reduce((max, row) => Math.max(max, Math.abs(row.difference ?? 0)), 0),
    };
  }, [rows]);

  return (
    <StrategyDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start trading"
      stats={[
        { label: "Repositories", value: String(marketCount) },
        { label: "To buy", value: String(buyCount), tone: "long" },
        { label: "To sell", value: String(sellCount), tone: "short" },
        { label: "Largest Δ", value: formatWeight(largestDelta) },
      ]}
      balance={balanceData}
      balanceLoading={isBalanceLoading}
      balancesLoading={isLoadingBalances}
      hasPositions={hasPositions}
      quotesLoading={isLoadingQuotes}
      quotesProgress={{ step: quoteProgress ?? 0, of: marketCount }}
      quotesError={errorGettingQuotes}
      mutation={executeTradeMutation}
      onAmountChange={setAmount}
      blockedReason={
        quotesStale
          ? "Pricing the new amount…"
          : buyCount + sellCount === 0
          ? "Every prediction already matches the market — there is nothing to trade."
          : !getQuotesResults
            ? "No quotes are available for these markets."
            : undefined
      }
      onSubmit={(value) =>
        executeTradeMutation.mutate({
          amount: value,
          getQuotesResults: getQuotesResults ?? [],
          tradeExecutor,
          tableData: rows,
        })
      }
      howItWorks={
        <>
          <p className="mb-2">These markets nest: each repository is a market inside the parent.</p>
          <ol className="list-inside list-decimal space-y-1.5 marker:font-medium marker:text-ink-3">
            <li>Mint complete sets of the parent market with the sUSDS you supply.</li>
            <li>For each repository, mint complete sets using that parent collateral.</li>
            <li>Sell dependencies trading above your predicted weight, down to that weight.</li>
            <li>Merge whatever complete sets remain back into parent collateral.</li>
            <li>Spend it buying dependencies trading below your predicted weight.</li>
          </ol>
        </>
      }
    />
  );
};
