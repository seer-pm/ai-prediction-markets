import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useWithdrawFromTradeExecutor } from "@/hooks/useWithdrawFromTradeExecutor";
import { collateral } from "@/utils/constants";
import React from "react";
import { Address, parseUnits } from "viem";
import { AmountDialog } from "./AmountDialog";

interface WithdrawInterfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Address;
  tradeExecutor: Address;
}

export const WithdrawInterface: React.FC<WithdrawInterfaceProps> = ({
  open,
  onOpenChange,
  account,
  tradeExecutor,
}) => {
  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: tradeExecutor,
    token: collateral.address,
  });

  const withdraw = useWithdrawFromTradeExecutor(() => onOpenChange(false));

  return (
    <AmountDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Withdraw ${collateral.symbol}`}
      description="Moves funds from the trade wallet back to your own wallet."
      unit={collateral.symbol}
      submitLabel="Withdraw"
      errorTitle="Withdrawal failed"
      balance={balanceData}
      balanceLoading={isBalanceLoading}
      isPending={withdraw.isPending}
      isError={withdraw.isError}
      error={withdraw.error}
      onReset={withdraw.reset}
      onSubmit={(amount) =>
        withdraw.mutate({
          account,
          tokens: [collateral.address],
          amounts: [parseUnits(amount, collateral.decimals)],
          tradeExecutor,
        })
      }
    />
  );
};
