import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useWithdrawFromTradeExecutor } from "@/hooks/useWithdrawFromTradeExecutor";
import { collateral, DECIMALS } from "@/utils/constants";
import React from "react";
import { useForm } from "react-hook-form";
import { Address, formatUnits, parseUnits } from "viem";
import { ErrorPanel } from "./ErrorPanel";

interface WithdrawInterfaceProps {
  account: Address;
  onClose: () => void;
  tradeExecutor: Address;
}

interface WithdrawFormData {
  amount: string;
}

export const WithdrawInterface: React.FC<WithdrawInterfaceProps> = ({
  account,
  tradeExecutor,
  onClose,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<WithdrawFormData>({
    mode: "all",
    defaultValues: {
      amount: "",
    },
  });

  const amount = watch("amount");

  // Get sUSDS balance
  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: tradeExecutor,
    token: collateral.address,
  });

  const balance = balanceData && formatUnits(balanceData.value, balanceData.decimals);

  const withdrawFromTradeExecutor = useWithdrawFromTradeExecutor(() => {
    onClose();
    reset();
  });

  const onSubmit = ({ amount }: WithdrawFormData) => {
    withdrawFromTradeExecutor.mutate({
      account,
      tokens: [collateral.address],
      amounts: [parseUnits(amount, collateral.decimals)],
      tradeExecutor,
    });
  };

  const handleMaxClick = () => {
    if (balance) {
      setValue("amount", balance, { shouldValidate: true });
    }
  };

  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Withdraw sUSDS</h3>
          <p className="text-white text-sm">Withdraw from trade wallet to your account</p>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer text-white hover:text-gray-200 p-2 hover:bg-white hover:bg-opacity-10 rounded-full transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Error Display */}
        {withdrawFromTradeExecutor.isError && (
          <ErrorPanel
            title="Withdraw Failed"
            description={withdrawFromTradeExecutor.error?.message}
            onDismiss={withdrawFromTradeExecutor.reset}
          />
        )}
        {/* Withdraw Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="mb-4">
            {/* Balance Display */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Balance:{" "}
                {isBalanceLoading ? (
                  <span className="animate-pulse">Loading...</span>
                ) : (
                  <span className="font-mono text-gray-900">
                    {balance ? Number(balance).toFixed(2) : 0} sUSDS
                  </span>
                )}
              </span>
              {!isBalanceLoading && (
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-medium"
                  disabled={withdrawFromTradeExecutor.isPending}
                >
                  Max
                </button>
              )}
            </div>

            <input
              {...register("amount", {
                required: "Amount is required",
                validate: (value) =>
                  parseUnits(value, DECIMALS) <= (balanceData?.value ?? 0n) || "Not enough balance",
              })}
              type="number"
              step="any"
              placeholder="0"
              className="mb-2 w-full p-4 text-lg border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={withdrawFromTradeExecutor.isPending}
            />
          </div>

          <div className="flex space-x-4 mb-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 bg-gray-300 text-gray-700 py-4 px-6 rounded-md hover:bg-gray-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={withdrawFromTradeExecutor.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={withdrawFromTradeExecutor.isPending || !!errors.amount || !amount}
            >
              {errors.amount ? errors.amount.message : "Withdraw"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
