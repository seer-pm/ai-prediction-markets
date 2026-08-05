import { Button, Panel } from "@/components/ui";
import { useCheckOldTradeExecutorCreated } from "@/hooks/useCheckTradeExecutorCreated";
import { useWalletStore } from "@/stores/walletStore";
import { formatAddress } from "@/utils/format";
import { useAccount } from "wagmi";

export const OldTradeWallet = () => {
  const { address: account, chain } = useAccount();
  const { data: oldExecutor } = useCheckOldTradeExecutorCreated(account);
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);
  const toggleIsUseOldWallet = useWalletStore((s) => s.toggleIsUseOldWallet);

  if (!account || !oldExecutor?.isCreated) return null;

  const explorer = chain?.blockExplorers?.default?.url;

  return (
    <Panel
      tone={isUseOldWallet ? "error" : "info"}
      title={
        isUseOldWallet ? "You are on the deprecated trade wallet" : "You have a deprecated trade wallet"
      }
      actions={
        <Button size="sm" onClick={() => toggleIsUseOldWallet()}>
          {isUseOldWallet ? "Switch back" : "Switch to it"}
        </Button>
      }
    >
      <p>
        It holds balances at{" "}
        <a
          href={explorer ? `${explorer}/address/${oldExecutor.predictedAddress}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-ink underline underline-offset-2 hover:text-ink-2"
        >
          {formatAddress(oldExecutor.predictedAddress, 10, 8)}
        </a>
        . You can view them and redeem settled markets from it, but not trade.
      </p>
    </Panel>
  );
};
