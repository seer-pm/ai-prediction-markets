import { useCheck7702Support } from "@/hooks/useCheck7702Support";
import useDebounce from "@/hooks/useDebounce";
import { useExecuteTradeStrategy } from "@/hooks/useExecuteTradeStrategy";
import { useGetQuotes } from "@/hooks/useGetQuotes";
import { TableData } from "@/types";
import { CHAIN_ID, COLLATERAL_TOKENS } from "@/utils/constants";
import React from "react";
import { useForm } from "react-hook-form";
import { Address } from "viem";
import { useBalance } from "wagmi";
import { ErrorPanel } from "./ErrorPanel";
import { LoadingPanel } from "./LoadingPanel";

interface TradingInterfaceProps {
  markets: TableData[];
  onClose: () => void;
  account: Address;
}

interface TradeFormData {
  amount: number;
}

const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary.address;

export const TradingInterface: React.FC<TradingInterfaceProps> = ({
  account,
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
  } = useForm<TradeFormData>({ mode: "all" });

  const amount = watch("amount", 0);

  const debouncedAmount = useDebounce(amount, 500);

  const {
    data: quotes,
    isLoading: isLoadingQuotes,
    isError: isErrorGettingQuotes,
    error: errorGettingQuotes,
    progress,
  } = useGetQuotes({
    account,
    amount: debouncedAmount,
    tableData: markets,
  });

  const { supports7702, isLoading: isLoading7702 } = useCheck7702Support();

  // Get sUSDS balance
  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address: account,
    token: collateral,
  });

  const balance = balanceData ? parseFloat(balanceData.formatted) : 0;

  const executeTradeMutation = useExecuteTradeStrategy(() => {
    onClose();
    reset();
  });

  const onSubmit = ({ amount }: TradeFormData) => {
    executeTradeMutation.mutate({ account, amount, quotes });
  };

  const handleMaxClick = () => {
    if (balance > 0) {
      setValue("amount", balance);
    }
  };

  // Strategy analysis
  const buyMarkets = markets.filter((m) => m.difference && m.difference > 0);
  const sellMarkets = markets.filter((m) => m.difference && m.difference < 0);

  const renderButtonText = () => {
    if (executeTradeMutation.isPending) {
      return (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
          Executing Strategy...
        </div>
      );
    }
    if (isLoading7702) {
      return "Checking 7702 support";
    }
    if (!supports7702) {
      return "Batching transactions not supported";
    }
    if (isLoadingQuotes) {
      return "Getting quotes...";
    }
    return "🚀 Execute Strategy";
  };

  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Execute AI Strategy</h3>
          <p className="text-blue-100 text-sm">Trade across all markets automatically</p>
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

      <div className="p-6">
        {/* Error Display */}
        {executeTradeMutation.isError && (
          <ErrorPanel
            title="Trade Execution Failed"
            description={executeTradeMutation.error?.message}
            onDismiss={executeTradeMutation.reset}
          />
        )}
        {isErrorGettingQuotes && (
          <ErrorPanel title="Quote Failed" description={errorGettingQuotes?.message} />
        )}

        {/* Loading Overlay */}
        {executeTradeMutation.isPending && (
          <LoadingPanel
            title="Executing Trade Strategy"
            description={`Processing transactions across ${
              buyMarkets.length + sellMarkets.length
            } markets.
                  This may take a few moments...`}
          />
        )}

        {isLoadingQuotes && (
          <LoadingPanel
            title={`Getting quotes: ${progress}/${buyMarkets.length + sellMarkets.length} markets`}
            description="Obtaining quotes to construct and execute trades. This may take a while..."
          />
        )}

        {/* Strategy Summary */}
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-800 mb-1">Buy Markets</h4>
              <p className="text-2xl font-bold text-green-600">{buyMarkets.length}</p>
              <p className="text-sm text-green-600">Undervalued opportunities</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <h4 className="font-medium text-red-800 mb-1">Sell Markets</h4>
              <p className="text-2xl font-bold text-red-600">{sellMarkets.length}</p>
              <p className="text-sm text-red-600">Overvalued positions</p>
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-800 mb-3">Strategy Overview</h4>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                Mint complete sets using all inputs with sUSDS.
              </div>
              <div className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                Sell overvalued markets down to the predicted price.
              </div>
              <div className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Use the sUSDS obtained from selling to buy undervalued markets up to the predicted
                price.
              </div>
            </div>
          </div>
        </div>

        {/* Trading Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total Investment Amount (sUSDS)
            </label>

            {/* Balance Display */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Balance:{" "}
                {isBalanceLoading ? (
                  <span className="animate-pulse">Loading...</span>
                ) : (
                  <span className="font-mono text-gray-900">{balance.toFixed(2)} sUSDS</span>
                )}
              </span>
              {!isBalanceLoading && balance > 0 && (
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
                required: "Amount is required",
                validate: (value) => value <= balance || "Not enough balance",
                valueAsNumber: true,
              })}
              type="number"
              step="0.01"
              placeholder="Enter total amount to invest"
              className="w-full p-4 text-lg border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={executeTradeMutation.isPending}
            />
            {errors.amount && <p className="mt-1 text-red-600 text-sm">{errors.amount.message}</p>}
          </div>

          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 bg-gray-300 text-gray-700 py-4 px-6 rounded-md hover:bg-gray-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={executeTradeMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={
                !supports7702 ||
                executeTradeMutation.isPending ||
                !!errors.amount ||
                !amount ||
                isLoadingQuotes ||
                !quotes ||
                isErrorGettingQuotes
              }
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
