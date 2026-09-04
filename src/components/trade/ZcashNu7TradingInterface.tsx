import { useExecuteZcashNu7Strategy } from "@/hooks/useExecuteZcashNu7Strategy";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { ZcashNu7TableData } from "@/types";
import { collateral } from "@/utils/constants";
import { formatAmount } from "@/utils/format";
import { isNu7LegActionable, isZcashNu7RowFundable, zcashNu7ShareOf } from "@/utils/zcashNu7Budget";
import React, { useMemo, useState } from "react";
import { Address } from "viem";
import { StrategyDialog } from "./StrategyDialog";

interface TradingInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markets: ZcashNu7TableData[];
  tradeExecutor: Address;
  isLoadingBalances: boolean;
}

/**
 * The NU7 run's review dialog.
 *
 * The phase list is overridden because this run is owner-signed and single-pass: it never authorises
 * a session key and never merges, so the shared `STRATEGY_PHASES` would show two rows the run cannot
 * enter and the ledger would tick them as done on success.
 */
export const ZcashNu7TradingInterface: React.FC<TradingInterfaceProps> = ({
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

  const executeTradeMutation = useExecuteZcashNu7Strategy();

  // Mirrored from the dialog so the "per question" stat updates as the user types. The dialog owns
  // the input; this is only ever read.
  const [amount, setAmount] = useState("");

  /**
   * Whether the run has anything to work with besides the mint amount.
   *
   * Deliberately narrower than the binary contest's "holds any outcome token": only a *sell* leg can
   * spend inventory, so a wallet holding nothing but outcomes this run would buy still needs an
   * amount, and letting it submit an empty run would die on the first quote.
   */
  const hasPositions = useMemo(
    () =>
      markets.some((row) =>
        row.outcomes.some((leg) => (leg.balance ?? 0n) > 0n && (leg.difference ?? 0) < 0),
      ),
    [markets],
  );

  const { fundableCount, buyLegs, sellLegs } = useMemo(() => {
    const fundable = markets.filter(isZcashNu7RowFundable);
    const legs = fundable.flatMap((row) => row.outcomes.filter(isNu7LegActionable));
    return {
      fundableCount: fundable.length,
      buyLegs: legs.filter((leg) => (leg.difference ?? 0) > 0).length,
      sellLegs: legs.filter((leg) => (leg.difference ?? 0) < 0).length,
    };
  }, [markets]);

  const perQuestion = zcashNu7ShareOf(amount, fundableCount);

  return (
    <StrategyDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start trading"
      phases={["requote", "mint", "sell", "buy", "settle"]}
      stats={[
        { label: "Questions", value: String(fundableCount) },
        { label: "Buy legs", value: String(buyLegs), tone: "long" },
        { label: "Sell legs", value: String(sellLegs), tone: "short" },
        {
          label: "Per question",
          value: Number(perQuestion) > 0 ? `${formatAmount(perQuestion)} ${collateral.symbol}` : "—",
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
      // Four plain sentences, not the algorithm. The mint mechanics — one complete set per question
      // funding all of its sells, sized against the hungriest — are ours to get right, not the
      // user's to audit; they live in `planZcashNu7Legs`. The last line stays because it is the one
      // thing that shows up in the wallet afterwards and would otherwise look like a bug.
      howItWorks={
        <ol className="list-inside list-decimal space-y-1.5 marker:font-medium marker:text-ink-3">
          <li>Your sUSDS is split evenly across the questions you predicted.</li>
          <li>
            Each outcome is traded toward your number: sold where the market prices it higher, bought
            where it prices it lower.
          </li>
          <li>
            If a question cannot afford every buy, all of them move part of the way rather than one
            going the whole way. Anything left over stays as sUSDS.
          </li>
          <li>
            Selling can leave you holding other outcomes from the same question. "Sell all positions"
            clears them.
          </li>
        </ol>
      }
    />
  );
};
