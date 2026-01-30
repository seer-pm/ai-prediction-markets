import { useDepositToTradeExecutor } from "@/hooks/useDepositToTradeExecutor";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { collateral, DECIMALS } from "@/utils/constants";
import React from "react";
import { useForm } from "react-hook-form";
import { Address, formatUnits, parseUnits } from "viem";
import { ErrorPanel } from "./ErrorPanel";

interface DepositInterfaceProps {
  onClose: () => void;
  account: Address;
  tradeExecutor: Address;
}

interface DepositFormData {
  amount: string;
}

export const DepositInterface: React.FC<DepositInterfaceProps> = ({
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
  } = useForm<DepositFormData>({
    mode: "all",
    defaultValues: {
      amount: "",
    },
  });

  const amount = watch("amount");

  // Get sUSDS balance
  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: account,
    token: collateral.address,
  });
  const balance = balanceData && formatUnits(balanceData.value, balanceData.decimals);

  const depositToTradeExecutor = useDepositToTradeExecutor(() => {
    onClose();
    reset();
  });

  const onSubmit = ({ amount }: DepositFormData) => {
    depositToTradeExecutor.mutate({
      tokens: [collateral.address],
      amounts: [parseUnits(amount, collateral.decimals)],
      use7702: false,
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
          <h3 className="text-xl font-bold text-white">Deposit sUSDS</h3>
          <p className="text-white text-sm">Deposit from your account to trade wallet</p>
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
      <p className="px-6 pt-4 text-sm">
        If you do not have sUSDS you can{" "}
        <a
          href="https://app.sky.money/?network=OP&widget=savings&flow=supply&source_token=USDC"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline hover:opacity-80 text-[#0b4c8c]"
        >
          turn USDS or USDC into sUSDS
        </a>{" "}
        (it will generate some yield).
      </p>

      <div className="px-6 py-4 space-y-4">
        {/* Error Display */}
        {depositToTradeExecutor.isError && (
          <ErrorPanel
            title="Deposit Failed"
            description={depositToTradeExecutor.error?.message}
            onDismiss={depositToTradeExecutor.reset}
          />
        )}
        {/* Deposit Form */}
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
                  disabled={depositToTradeExecutor.isPending}
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
              disabled={depositToTradeExecutor.isPending}
            />
          </div>

          <div className="flex space-x-4 mb-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 bg-gray-300 text-gray-700 py-4 px-6 rounded-md hover:bg-gray-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={depositToTradeExecutor.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={depositToTradeExecutor.isPending || !!errors.amount || !amount}
            >
              {errors.amount ? errors.amount.message : "Deposit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
