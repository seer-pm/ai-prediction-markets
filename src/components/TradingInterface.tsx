import React from "react";
import { useForm } from "react-hook-form";
import { MarketData } from "../types";

interface TradingInterfaceProps {
  markets: MarketData[];
  onTrade: (amount: number) => void;
  onClose: () => void;
  isConnected: boolean;
}

interface TradeFormData {
  amount: number;
}

export const TradingInterface: React.FC<TradingInterfaceProps> = ({
  markets,
  onTrade,
  onClose,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<TradeFormData>();

  const watchAmount = watch("amount", 0);
  const mintingAmount = watchAmount * 0.5;
  const tradingAmount = watchAmount * 0.5;

  const onSubmit = (data: TradeFormData) => {
    onTrade(data.amount);
    reset();
  };

  // Strategy analysis
  const buyMarkets = markets.filter((m) => m.difference > 0);
  const sellMarkets = markets.filter((m) => m.difference < 0);

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
                50% of input will be used for minting
              </div>
              <div className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Buy undervalued markets up to the predicted price
              </div>
              <div className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                Sell overvalued markets down to the predicted price
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
            <input
              {...register("amount", {
                required: "Amount is required",
                min: { value: 1, message: "Minimum amount is 1 sUSDS" },
                max: { value: 100000, message: "Maximum amount is 100,000 sUSDS" },
                valueAsNumber: true,
              })}
              type="number"
              step="0.01"
              placeholder="Enter total amount to invest"
              className="w-full p-4 text-lg border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.amount && <p className="mt-1 text-red-600 text-sm">{errors.amount.message}</p>}
          </div>

          {/* Investment Breakdown */}
          {watchAmount > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">Investment Allocation</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-600">Minting (50%):</span>
                  <span className="font-mono ml-2 font-semibold">
                    {mintingAmount.toFixed(2)} sUSDS
                  </span>
                </div>
                <div>
                  <span className="text-blue-600">Trading (50%):</span>
                  <span className="font-mono ml-2 font-semibold">
                    {tradingAmount.toFixed(2)} sUSDS
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 bg-gray-300 text-gray-700 py-4 px-6 rounded-md hover:bg-gray-400 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg"
            >
              🚀 Execute Strategy
            </button>
          </div>

          <div className="text-center space-y-2">
            <p className="text-xs text-gray-500">
              This will execute trades across all {markets.length} markets automatically
            </p>
            <p className="text-xs text-gray-400">
              Strategy: Buy undervalued • Sell overvalued • Never exceed predicted prices
            </p>
          </div>
        </form>

        {/* Detailed Strategy Breakdown */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              Strategy Details ({markets.length} markets)
              <svg
                className="w-4 h-4 transform group-open:rotate-180 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </summary>
            <div className="mt-4 space-y-4">
              {buyMarkets.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-green-700 mb-2">
                    Buy Markets ({buyMarkets.length})
                  </h5>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {buyMarkets.slice(0, 5).map((market) => (
                      <div
                        key={market.marketId}
                        className="flex justify-between text-xs text-gray-600"
                      >
                        <span className="truncate">
                          {market.repo.replace("https://github.com/", "")}
                        </span>
                        <span className="text-green-600">+{market.difference.toFixed(6)}</span>
                      </div>
                    ))}
                    {buyMarkets.length > 5 && (
                      <div className="text-xs text-gray-400">
                        ... and {buyMarkets.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {sellMarkets.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-red-700 mb-2">
                    Sell Markets ({sellMarkets.length})
                  </h5>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {sellMarkets.slice(0, 5).map((market) => (
                      <div
                        key={market.marketId}
                        className="flex justify-between text-xs text-gray-600"
                      >
                        <span className="truncate">
                          {market.repo.replace("https://github.com/", "")}
                        </span>
                        <span className="text-red-600">{market.difference.toFixed(6)}</span>
                      </div>
                    ))}
                    {sellMarkets.length > 5 && (
                      <div className="text-xs text-gray-400">
                        ... and {sellMarkets.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};
