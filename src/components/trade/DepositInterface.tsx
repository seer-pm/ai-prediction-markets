import { useDepositToTradeExecutor } from "@/hooks/useDepositToTradeExecutor";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { collateral } from "@/utils/constants";
import React, { useState } from "react";
import { Address, parseUnits } from "viem";
import { ConvertInterface } from "../ConvertInterface";
import { AmountDialog } from "./AmountDialog";

interface DepositInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Address;
  tradeExecutor: Address;
}

export const DepositInterface: React.FC<DepositInterfaceProps> = ({
  open,
  onOpenChange,
  account,
  tradeExecutor,
}) => {
  const [isConvertOpen, setIsConvertOpen] = useState(false);

  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: account,
    token: collateral.address,
  });

  const deposit = useDepositToTradeExecutor(() => onOpenChange(false));

  return (
    <>
      <AmountDialog
        open={open}
        onOpenChange={onOpenChange}
        title={`Deposit ${collateral.symbol}`}
        description="Moves funds from your wallet into the trade wallet, where strategies run."
        unit={collateral.symbol}
        submitLabel="Deposit"
        errorTitle="Deposit failed"
        balance={balanceData}
        balanceLoading={isBalanceLoading}
        isPending={deposit.isPending}
        isError={deposit.isError}
        error={deposit.error}
        onReset={deposit.reset}
        onSubmit={(amount) =>
          deposit.mutate({
            tokens: [collateral.address],
            amounts: [parseUnits(amount, collateral.decimals)],
            use7702: false,
            tradeExecutor,
          })
        }
        intro={
          <p className="text-body text-ink-3">
            No {collateral.symbol} yet?{" "}
            <button
              type="button"
              onClick={() => setIsConvertOpen(true)}
              className="cursor-pointer font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
            >
              Convert USDS or USDC
            </button>{" "}
            first — it earns yield while it sits here.
          </p>
        }
      />

      <ConvertInterface
        open={isConvertOpen}
        onOpenChange={setIsConvertOpen}
        account={account}
      />
    </>
  );
};
