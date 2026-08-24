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
}

export const ZcashTradingInterface: React.FC<TradingInterfaceProps> = ({
  open,
  onOpenChange,
  tradeExecutor,
  markets,
}) => {
  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: tradeExecutor,
    token: collateral.address,
  });

  const executeTradeMutation = useExecuteZcashStrategy();

  // Mirrored from the dialog so the "per market" stat updates as the user types. The dialog owns
  // the input; this is only ever read.
  const [amount, setAmount] = useState("");

  // Counted over fundable rows only, so the three numbers reconcile: approve + reject = markets.
  // A row the market already agrees with is in none of them.
  const { fundableCount, approveCount, rejectCount } = useMemo(() => {
    const fundable = markets.filter(isZcashRowFundable);
    return {
      fundableCount: fundable.length,
      approveCount: fundable.filter((market) => market.predictedApproved === true).length,
      rejectCount: fundable.filter((market) => market.predictedApproved === false).length,
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
        { label: "Approve", value: String(approveCount), tone: "long" },
        { label: "Reject", value: String(rejectCount), tone: "short" },
        {
          label: "Per market",
          value: Number(perMarket) > 0 ? `${formatAmount(perMarket)} ${collateral.symbol}` : "—",
        },
      ]}
      balance={balanceData}
      balanceLoading={isBalanceLoading}
      mutation={executeTradeMutation}
      onAmountChange={setAmount}
      blockedReason={
        fundableCount === 0
          ? "The market already agrees with every call you made, so there is nothing to trade."
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
        <>
          <p className="mb-2">
            Your money is split evenly across the proposals you marked where the market still
            disagrees with you.
          </p>
          <ol className="list-inside list-decimal space-y-1.5 marker:font-medium marker:text-ink-3">
            <li>Sell anything you already hold on the side you are now betting against.</li>
            <li>
              Either buy the side you picked, or mint a complete set and sell the other side,
              whichever leaves you with more outcome tokens.
            </li>
            <li>If yes and no together cost more than a dollar, mint and sell both.</li>
          </ol>
        </>
      }
    />
  );
};
