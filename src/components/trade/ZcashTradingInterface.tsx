import { useExecuteZcashStrategy } from "@/hooks/useExecuteZcashStrategy";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { isZcashRowFundable, zcashShareOf } from "@/utils/zcashBudget";
import { ZcashTableData } from "@/types";
import { collateral } from "@/utils/constants";
import { formatAmount } from "@/utils/format";
import React, { useMemo, useState } from "react";
import { Address } from "viem";
import { StrategyDialog } from "./StrategyDialog";

interface TradingInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markets: ZcashTableData[];
  tradeExecutor: Address;
  isLoadingBalances: boolean;
}

export const ZcashTradingInterface: React.FC<TradingInterfaceProps> = ({
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

  const executeTradeMutation = useExecuteZcashStrategy();

  // Mirrored from the dialog so the "per market" stat updates as the user types. The dialog owns
  // the input; this is only ever read.
  const [amount, setAmount] = useState("");

  // Nothing held and nothing minted means the run has no input at all: the
  // budget allocates zero to every row and the pass dies on "No quote found".
  const hasPositions = useMemo(
    () => markets.some((m) => (m.yesBalance ?? 0n) > 0n || (m.noBalance ?? 0n) > 0n),
    [markets],
  );

  // Counted over fundable rows only. Unlike the old yes/no counts these do not have to sum to
  // `fundableCount`: a row whose YES price already sits on the user's number, but whose NO side is
  // rich enough to trade, is fundable and belongs to neither bucket.
  const { fundableCount, aboveCount, belowCount } = useMemo(() => {
    const fundable = markets.filter(isZcashRowFundable);
    return {
      fundableCount: fundable.length,
      aboveCount: fundable.filter((market) => (market.yesDifference ?? 0) > 0).length,
      belowCount: fundable.filter((market) => (market.yesDifference ?? 0) < 0).length,
    };
  }, [markets]);

  const perMarket = zcashShareOf(amount, fundableCount);

  return (
    <StrategyDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start trading"
      stats={[
        { label: "Markets", value: String(fundableCount) },
        { label: "Above market", value: String(aboveCount), tone: "long" },
        { label: "Below market", value: String(belowCount), tone: "short" },
        {
          label: "Per market",
          value: Number(perMarket) > 0 ? `${formatAmount(perMarket)} ${collateral.symbol}` : "—",
        },
      ]}
      balance={balanceData}
      balanceLoading={isBalanceLoading}
      balancesLoading={isLoadingBalances}
      hasPositions={hasPositions}
      mutation={executeTradeMutation}
      onAmountChange={setAmount}
      blockedReason={
        fundableCount === 0
          ? "Every prediction you gave already matches the market, so there is nothing to trade."
          : undefined
      }
      onSubmit={(value) =>
        executeTradeMutation.mutate({
          amount: value,
          tableData: markets,
          tradeExecutor,
        })
      }
      howItWorks={
        <ol className="list-inside list-decimal space-y-1.5 marker:font-medium marker:text-ink-3">
          <li>
            Sell tokens you already hold on a side priced above your prediction, down to your
            prediction.
          </li>
          <li>
            Divide the sUSDS input equally across the markets you predicted that are still off by
            half a point or more. For each market, sUSDS from the first step will also be added
            here, if any.
          </li>
          <li>
            Where yes and no together cost more than 1.02, mint complete sets and sell both sides
            until they sum to 1 — this ignores your prediction.
          </li>
          <li>
            Otherwise move both pools to your prediction: buy a side priced below it, sell a side
            priced above it, minting a complete set when your balance falls short.
          </li>
          <li>
            When a market does not have enough sUSDS for the full move, both sides move the same
            fraction of the way — never one side alone. Anything left over stays as sUSDS.
          </li>
        </ol>
      }
    />
  );
};
