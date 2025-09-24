import { useMarketsData } from "@/hooks/useMarketsData";
import { useTokensBalances } from "@/hooks/useTokensBalances";
import { useWithdrawFromTradeExecutor } from "@/hooks/useWithdrawFromTradeExecutor";
import { ExclamationCircleIcon } from "@/lib/icons";
import React from "react";
import { Address } from "viem";

interface WithdrawTokensInterfaceProps {
  account: Address;
  onClose: () => void;
  tradeExecutor: Address;
}

export const WithdrawTokensInterface: React.FC<WithdrawTokensInterfaceProps> = ({
  account,
  tradeExecutor,
  onClose,
}) => {
  const { data } = useMarketsData();
  const withdrawFromTradeExecutor = useWithdrawFromTradeExecutor(() => {
    onClose();
  });
  const { data: balances, isLoading: isLoadingBalances } = useTokensBalances(
    tradeExecutor,
    data?.wrappedTokens
  );

  const sumBalances = balances?.reduce((acc, curr) => acc + curr, 0n) ?? 0n;
  const handleWithdraw = async () => {
    if (!balances) {
      return;
    }
    withdrawFromTradeExecutor.mutate({
      account,
      tokens: data?.wrappedTokens ?? [],
      amounts: balances,
      tradeExecutor,
    });
  };

  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Header with Close Button */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Withdraw outcome tokens</h3>
          <p className="text-sm text-white">
            Withdraw all positions from trade wallet to your account
          </p>
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
        {sumBalances > 0n && (
          <div className="flex items-start space-x-3 rounded border border-yellow-400 bg-yellow-50 p-4">
            <ExclamationCircleIcon fill="#CA8A04" />
            <div className="flex-1 text-sm text-yellow-800">
              <p className="font-medium">Be careful</p>
              <p className="mt-1">
                If you withdraw your outcome tokens, you will need to trade/redeem them one by one
                which will take a lot of transactions. Only do this if you know what you are doing
                (or if you don&apos;t mind a lot of clicking).
              </p>
            </div>
          </div>
        )}
        {isLoadingBalances ? (
          <p>Checking balances...</p>
        ) : sumBalances === 0n ? (
          <p>Nothing to withdrawn</p>
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
              onClick={() => handleWithdraw()}
              className="cursor-pointer flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={withdrawFromTradeExecutor.isPending}
            >
              Withdraw
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
