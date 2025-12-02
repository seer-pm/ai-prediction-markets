import { useSellToCollateral } from "@/hooks/useSellToCollateral";
import { OriginalityTableData } from "@/types";
import React from "react";
import { Address } from "viem";

interface SellAllTokensInterfaceProps {
  onClose: () => void;
  tradeExecutor: Address;
  markets: OriginalityTableData[] | undefined;
}

export const SellAllOriginalityTokensInterface: React.FC<SellAllTokensInterfaceProps> = ({
  tradeExecutor,
  onClose,
  markets,
}) => {
  const sellAllFromTradeExecutor = useSellToCollateral(() => {
    onClose();
  });

  const handleSellAll = async () => {
    if (!markets) return;
    sellAllFromTradeExecutor.mutate({
      tradeExecutor,
      tableData: markets,
    });
  };

  const hasTokens = !!markets?.filter((x) => x.upBalance || x.downBalance)?.length;

  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Sell all outcome tokens</h3>
          <p className="text-sm text-white">Sell all positions to sUSDS</p>
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
        {!hasTokens ? (
          <p>Nothing to sell</p>
        ) : (
          <div className="flex space-x-4 mb-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer flex-1 bg-gray-300 text-gray-700 py-4 px-6 rounded-md hover:bg-gray-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSellAll()}
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={sellAllFromTradeExecutor.isPending}
            >
              Sell
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
