import { useCheckOldTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { InfoCircleIcon } from "@/lib/icons";
import { useWalletStore } from "@/stores/walletStore";
import { useAccount } from "wagmi";

export const OldTradeWallet = () => {
  const { address: account, chain } = useAccount();
  const { data: checkTradeExecutorResult } = useCheckOldTradeExecutorCreated(account);
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);
  const toggleIsUseOldWallet = useWalletStore((s) => s.toggleIsUseOldWallet);
  const blockExplorerUrl = chain?.blockExplorers?.default?.url;
  if (!account || !checkTradeExecutorResult?.isCreated) {
    return null;
  }
  return (
    <>
      {account && checkTradeExecutorResult?.isCreated && (
        <div className="flex items-center gap-4 p-4 border rounded-[4px] border-[#FF9900]">
          <InfoCircleIcon width="24" height="24" />
          <div className="space-y-3">
            <p className="text-sm">
              You have a deprecated trade wallet at{" "}
              <a
                href={
                  blockExplorerUrl &&
                  `${blockExplorerUrl}/address/${checkTradeExecutorResult?.predictedAddress}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm leading-relaxed text-purple-800 hover:opacity-80 break-all"
              >
                {checkTradeExecutorResult?.predictedAddress}
              </a>
              .
              <br />
              You can view token balances and redeem markets with this wallet, but trading is not
              supported. You can switch to or from this wallet here.
            </p>
            <button
              onClick={() => toggleIsUseOldWallet()}
              className="cursor-pointer px-5 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium text-white shadow-md transition-colors duration-200 w-full sm:w-auto"
            >
              {isUseOldWallet ? "Switch to new wallet" : "Switch to deprecated wallet"}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
