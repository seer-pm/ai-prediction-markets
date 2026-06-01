import { MarketTable } from "@/components/MarketTable";
import { RedeemInterface } from "@/components/trade/RedeemInterface";
import { WithdrawOutcomeTokensInterface } from "@/components/trade/WithdrawOutcomeTokensInterface";
import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useMarketsData } from "@/hooks/useMarketsData";
import { useProcessPredictions } from "@/hooks/useProcessPredictions";
import { startTransition, useCallback, useMemo, useState } from "react";
import "react-toastify/dist/ReactToastify.css";
import { useAccount } from "wagmi";
import { Modal } from "../Modal";

export const AiMarkets = () => {
  const { data: tableData, isLoading, isLoadingBalances, error } = useProcessPredictions([]);
  const { address: account } = useAccount();
  const { data: checkTradeExecutorResult } = useCheckTradeExecutorCreated(account);
  const [isWithdrawTokensDialogOpen, setIsWithdrawTokensDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);

  const { data: marketsData } = useMarketsData();
  const withdrawTokens = useMemo(() => marketsData?.wrappedTokens, [marketsData?.wrappedTokens]);

  const closeWithdrawTokensDialog = useCallback(
    () => startTransition(() => setIsWithdrawTokensDialogOpen(false)),
    [],
  );
  const closeRedeemDialog = useCallback(
    () => startTransition(() => setIsRedeemDialogOpen(false)),
    [],
  );

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
            onClick={() => startTransition(() => setIsWithdrawTokensDialogOpen(true))}
            className="cursor-pointer px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
          >
            Withdraw outcome tokens
          </button>
          <button
            onClick={() => startTransition(() => setIsRedeemDialogOpen(true))}
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
      <Modal isOpen={isWithdrawTokensDialogOpen} onClose={closeWithdrawTokensDialog}>
        <WithdrawOutcomeTokensInterface
          account={account!}
          tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
          onClose={closeWithdrawTokensDialog}
          tokens={withdrawTokens}
        />
      </Modal>
      <Modal isOpen={isRedeemDialogOpen} onClose={closeRedeemDialog}>
        <RedeemInterface
          account={account!}
          tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
          onClose={closeRedeemDialog}
        />
      </Modal>
    </>
  );
};
