import { useCheckTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useCreateTradeExecutor } from "@/hooks/useCreateTradeExecutor";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { collateral } from "@/utils/constants";
import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { DepositInterface } from "./DepositInterface";
import { WithdrawInterface } from "./WithdrawInterface";
import { WithdrawTokensInterface } from "./WithdrawTokensInterface";

export const TradeWallet = () => {
  const { address: account, chain } = useAccount();
  const { data: checkTradeExecutorResult } = useCheckTradeExecutorCreated(account);
  const createTradeExecutorMutate = useCreateTradeExecutor();
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [isWithdrawTokensDialogOpen, setIsWithdrawTokensDialogOpen] = useState(false);

  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: checkTradeExecutorResult?.predictedAddress,
    token: collateral.address,
  });
  const balance = balanceData ? Number(formatUnits(balanceData.value, balanceData.decimals)) : 0;

  const blockExplorerUrl = chain?.blockExplorers?.default?.url;

  return (
    <>
      {isDepositDialogOpen && (
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-0.5 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[45rem] w-full max-h-[90vh] overflow-hidden">
            <DepositInterface
              account={account!}
              tradeExecutor={checkTradeExecutorResult?.predictedAddress!}
              onClose={() => setIsDepositDialogOpen(false)}
            />
          </div>
        </div>
      )}
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
      {account && !checkTradeExecutorResult?.isCreated && (
        <div className="mx-auto p-6 bg-slate-800 rounded-2xl shadow-lg text-white">
          <h3 className="text-xl font-semibold mb-3">Trade Wallet</h3>
          <p className="text-sm leading-relaxed text-slate-200 mb-6">
            Create a trade wallet to make multiple trades and redeem tokens in a single transaction.
          </p>
          <button
            onClick={() => createTradeExecutorMutate.mutate({ account })}
            className="cursor-pointer px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200"
            disabled={createTradeExecutorMutate.isPending}
          >
            {createTradeExecutorMutate.isPending ? "Creating..." : "Create Wallet"}
          </button>
        </div>
      )}
      {account && checkTradeExecutorResult?.isCreated && (
        <div className="mx-auto bg-slate-800 rounded-2xl shadow-lg text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            {/* Left side: title + buttons */}
            <div className="space-y-3 p-6 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-semibold">Trade Wallet</h3>
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

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setIsDepositDialogOpen(true)}
                  className="cursor-pointer px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
                >
                  Deposit sUSDS
                </button>
                <button
                  onClick={() => setIsWithdrawDialogOpen(true)}
                  className="cursor-pointer px-5 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
                >
                  Withdraw sUSDS
                </button>
                <button
                  onClick={() => setIsWithdrawTokensDialogOpen(true)}
                  className="cursor-pointer px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
                >
                  Withdraw outcome tokens
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
