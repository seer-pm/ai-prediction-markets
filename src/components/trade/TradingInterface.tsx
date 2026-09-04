import useDebounce from "@/hooks/useDebounce";
import { useExecuteTradeStrategy } from "@/hooks/useExecuteTradeStrategy";
import { useGetQuotes } from "@/hooks/useGetQuotes";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { TableData } from "@/types";
import { collateral } from "@/utils/constants";
import { formatWeight } from "@/utils/format";
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

export const TradingInterface: React.FC<TradingInterfaceProps> = ({
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
  } = useGetQuotes({ account: tradeExecutor, amount: debouncedAmount, tableData: rows });

  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: tradeExecutor,
    token: collateral.address,
  });

  const executeTradeMutation = useExecuteTradeStrategy();

  // Nothing held and nothing minted means the run has no input at all — the
  // dialog turns the amount into a requirement rather than letting it fail on
  // the first quote.
  const hasPositions = useMemo(() => rows.some((row) => (row.balance ?? 0n) > 0n), [rows]);

  const { buyCount, sellCount, largestDelta } = useMemo(() => {
    const deltas = rows.map((row) => row.difference).filter((d): d is number => !!d);
    return {
      buyCount: deltas.filter((d) => d > 0).length,
      sellCount: deltas.filter((d) => d < 0).length,
      largestDelta: deltas.reduce((max, d) => Math.max(max, Math.abs(d)), 0),
    };
  }, [rows]);

  return (
    <StrategyDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start trading"
      stats={[
        { label: "Markets", value: String(buyCount + sellCount) },
        { label: "To buy", value: String(buyCount), tone: "long" },
        { label: "To sell", value: String(sellCount), tone: "short" },
        { label: "Largest Δ", value: formatWeight(largestDelta) },
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
          <li>Mint complete sets from your sUSDS input.</li>
          <li>Sell repositories priced above your weight, down to your weight or your balance.</li>
          <li>Merge leftover complete sets back to sUSDS.</li>
          <li>
            Split the proceeds across repositories priced below your weight, in proportion to the
            gap, and buy each up to your weight.
          </li>
        </ol>
      }
    />
  );
};
