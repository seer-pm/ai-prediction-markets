import { collateral } from "@/utils/constants";
import { useWalletStore } from "@/stores/walletStore";
import { useAccount } from "wagmi";
import { useCheckTradeExecutorCreated } from "./useCheckTradeExecutorCreated";
import { useTokenBalance } from "./useTokenBalance";

export type ReadinessStep = "connect" | "create" | "fund" | "ready";

/**
 * Single source of truth for "can this account trade yet".
 *
 * Every tab used to inline `checkTradeExecutorResult?.isCreated && !isUseOldWallet`
 * as a render guard, so the trade actions simply vanished with no explanation
 * when any part of it was false. The readiness rail and the header wallet menu
 * both read this instead.
 */
export function useTradeWalletStatus() {
  const { address: account, chain, isConnected, isConnecting } = useAccount();
  const isUseOldWallet = useWalletStore((s) => s.isUseOldWallet);

  const { data: executor, isLoading: isCheckingExecutor } = useCheckTradeExecutorCreated(account);
  const tradeExecutor = executor?.predictedAddress;
  const isCreated = !!executor?.isCreated;

  const { data: balanceData, isLoading: isBalanceLoading } = useTokenBalance({
    address: isCreated ? tradeExecutor : undefined,
    token: collateral.address,
  });

  const balance = balanceData?.value ?? 0n;
  const isFunded = balance > 0n;

  // While a check is still in flight we don't know which step is current, so
  // stay on "ready" — otherwise a funded wallet flashes "Add sUSDS" on every
  // page load before its balance arrives.
  const isResolving = isConnected && (isCheckingExecutor || (isCreated && isBalanceLoading));

  const step: ReadinessStep = !isConnected
    ? "connect"
    : isResolving
      ? "ready"
      : !isCreated
        ? "create"
        : !isFunded
          ? "fund"
          : "ready";

  return {
    account,
    chain,
    isConnected,
    isConnecting,
    tradeExecutor,
    isCreated,
    isCheckingExecutor,
    balance,
    balanceData,
    isBalanceLoading,
    isFunded,
    isUseOldWallet,
    step,
    /** Trading is only possible on a funded, non-deprecated wallet. */
    canTrade: isCreated && !isUseOldWallet,
  };
}
