import { useCheckOldTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { collateral } from "@/utils/constants";
import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { WithdrawInterface } from "./WithdrawInterface";

export const OldTradeWallet = () => {
  const { address: account, chain } = useAccount();
  const { data: checkTradeExecutorResult } = useCheckOldTradeExecutorCreated(account);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);

  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: checkTradeExecutorResult?.predictedAddress,
    token: collateral.address,
  });
  const balance = balanceData ? Number(formatUnits(balanceData.value, balanceData.decimals)) : 0;

  const blockExplorerUrl = chain?.blockExplorers?.default?.url;
  if (!account || !checkTradeExecutorResult?.isCreated || !balance) {
    return null;
  }
  return (
    <>
      {isWithdrawDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <WithdrawInterface
              account={account!}
              tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
              onClose={() => setIsWithdrawDialogOpen(false)}
            />
          </div>
        </div>
      )}
      {account && checkTradeExecutorResult?.isCreated && (
        <div className="mx-auto bg-slate-800 rounded-2xl shadow-lg text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            {/* Left side: title + buttons */}
            <div className="space-y-3 p-6 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-semibold">Trade Wallet (deprecated)</h3>
                <a
                  href={
                    blockExplorerUrl &&
                    `${blockExplorerUrl}/address/${checkTradeExecutorResult?.predictedAddress}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm leading-relaxed text-slate-200 hover:opacity-80 break-all"
                >
                  {checkTradeExecutorResult?.predictedAddress}
                </a>
              </div>
              <p className="text-sm">Please withdraw your fund from this trade wallet</p>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setIsWithdrawDialogOpen(true)}
                  className="cursor-pointer px-5 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
                >
                  Withdraw sUSDS
                </button>
              </div>
            </div>

            {/* Right side: balance */}
            <div className="p-6 flex flex-col items-center gap-2 border-t md:border-t-0 md:border-l border-white">
              <h3 className="text-xl font-semibold">
                <a
                  href="https://app.sky.money/?network=OP&widget=savings&flow=supply&source_token=USDC"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  sUSDS
                </a>{" "}
                Balance
              </h3>
              <h4 className="font-semibold">
                {isBalanceLoading ? (
                  <span className="animate-pulse">Loading...</span>
                ) : (
                  <span>{balance.toFixed(2)}</span>
                )}
              </h4>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
