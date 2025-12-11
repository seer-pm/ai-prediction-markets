import { MarketTable } from "@/components/MarketTable";
import { RedeemInterface } from "@/components/trade/RedeemInterface";
import { WithdrawTokensInterface } from "@/components/trade/WithdrawTokensInterface";
import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useProcessPredictions } from "@/hooks/useProcessPredictions";
import { useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { useAccount } from "wagmi";

export const AiMarkets = () => {
  const { data: tableData, isLoading, isLoadingBalances, error } = useProcessPredictions([]);
  const { address: account } = useAccount();
  const { data: checkTradeExecutorResult } = useCheckTradeExecutorCreated(account);
  const [isWithdrawTokensDialogOpen, setIsWithdrawTokensDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800">Error loading market data: {error.message}</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          <button
            onClick={() => setIsWithdrawTokensDialogOpen(true)}
            className="cursor-pointer px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
          >
            Withdraw outcome tokens
          </button>
          <button
            onClick={() => setIsRedeemDialogOpen(true)}
            className="cursor-pointer px-5 py-2.5 bg-[#C218C2] hover:bg-[#A014A0] rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
          >
            Redeem outcome tokens
          </button>
        </div>
      </div>
      <MarketTable
        rows={tableData || []}
        isLoading={isLoading}
        isLoadingBalances={isLoadingBalances}
      />
      {isWithdrawTokensDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <WithdrawTokensInterface
              account={account!}
              tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
              onClose={() => setIsWithdrawTokensDialogOpen(false)}
            />
          </div>
        </div>
      )}
      {isRedeemDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <RedeemInterface
              account={account!}
              tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
              onClose={() => setIsRedeemDialogOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};
