import { useExecuteOriginalityStrategy } from "@/hooks/useExecuteOriginalityStrategy";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { OriginalityTableData } from "@/types";
import { collateral, DECIMALS } from "@/utils/constants";
import React from "react";
import { useForm } from "react-hook-form";
import { Address, formatUnits, parseUnits } from "viem";
import { ErrorPanel } from "./ErrorPanel";
import { LoadingPanel } from "./LoadingPanel";

interface TradingInterfaceProps {
  markets: OriginalityTableData[];
  onClose: () => void;
  tradeExecutor: Address;
}

interface TradeFormData {
  amount: string;
}

export const OriginalityTradingInterface: React.FC<TradingInterfaceProps> = ({
  tradeExecutor,
  markets,
  onClose,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<TradeFormData>({
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

  const executeTradeMutation = useExecuteOriginalityStrategy(() => {
    onClose();
    reset();
  });

  const onSubmit = ({ amount }: TradeFormData) => {
    executeTradeMutation.mutate({
      amount,
      tableData: markets,
      tradeExecutor,
    });
  };

  const handleMaxClick = () => {
    if (balance) {
      setValue("amount", balance, { shouldValidate: true });
    }
  };

  // Strategy analysis
  const readyMarkets = markets.filter((m) => m.upDifference || m.downDifference);
  const renderButtonText = () => {
    if (executeTradeMutation.isPending) {
      return (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
          Executing Strategy...
        </div>
      );
    }
    if (errors.amount) {
      return errors.amount.message;
    }

    return "🚀 Execute Strategy";
  };

  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Execute Originality Strategy</h3>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer text-white hover:text-gray-200 p-2 hover:bg-white hover:bg-opacity-10 rounded-full transition-colors"
          disabled={executeTradeMutation.isPending}
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
        {executeTradeMutation.isError && (
          <ErrorPanel
            title="Trade Execution Failed"
            description={executeTradeMutation.error?.message}
            onDismiss={executeTradeMutation.reset}
          />
        )}

        {/* Loading Overlay */}
        {executeTradeMutation.isPending && (
          <LoadingPanel
            title="Executing Trade Strategy"
            description={`Processing transactions across ${readyMarkets.length} markets.
                  This may take a few moments...`}
          />
        )}

        <div className="px-4 py-2 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-800 mb-2">Strategy Overview</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 marker:font-semibold">
            <li>Mint complete sets of the Level 1 market using sUSDS inputs.</li>
            <li>Sell overvalued UP/DOWN tokens from balance (but never below fair value).</li>
            <li>
              For each Level 2 scalar market, the strategy will either:
              <ol className="list-[lower-alpha] list-inside ml-6 space-y-1">
                <li>Buy the undervalued token directly up to the predicted fair value.</li>
                <li>
                  Or:
                  <ol className="list-[roman] list-inside ml-6 space-y-1">
                    <li>Mint a complete set of UP + DOWN tokens.</li>
                    <li>Immediately sell the overvalued token (but never below fair value).</li>
                    <li>Use the proceeds to buy the undervalued token, up to fair value.</li>
                  </ol>
                </li>
              </ol>
            </li>
          </ol>
        </div>

        {/* Trading Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount to mint (sUSDS)
            </label>

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
                  disabled={executeTradeMutation.isPending}
                >
                  Max
                </button>
              )}
            </div>

            <input
              {...register("amount", {
                validate: (value) =>
                  parseUnits(value, DECIMALS) <= (balanceData?.value ?? 0n) || "Not enough balance",
              })}
              type="number"
              step="any"
              placeholder="Enter amount to mint"
              className="mb-2 w-full p-4 text-lg border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={executeTradeMutation.isPending}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-3 sm:space-y-0 mb-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 bg-gray-300 text-gray-700 py-3 sm:py-4 px-6 rounded-md hover:bg-gray-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={executeTradeMutation.isPending}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 sm:py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={executeTradeMutation.isPending || !!errors.amount || !amount}
            >
              {renderButtonText()}
            </button>
          </div>

          <div className="text-center space-y-2">
            <p className="text-xs text-gray-500">
              This will execute trades across all markets automatically
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
