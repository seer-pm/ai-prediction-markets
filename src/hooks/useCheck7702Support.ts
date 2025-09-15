import { Address, Hex } from "viem";
import { gnosis } from "viem/chains";
import { useAccount, useCapabilities } from "wagmi";

export type Execution = {
  to: Address;
  value: bigint;
  data: Hex;
};

export function useCheck7702Support(): { supports7702: boolean; isLoading: boolean } {
  const { chainId } = useAccount();
  const { data: capabilities, isLoading } = useCapabilities();

  if (!chainId || !capabilities) {
    return {
      supports7702: false,
      isLoading,
    };
  }

  if (chainId === gnosis.id) {
    // metamask doesn't work on gnosis
    return {
      supports7702: false,
      isLoading,
    };
  }

  return {
    supports7702:
      capabilities[chainId]?.atomic?.status === "ready" ||
      capabilities[chainId]?.atomic?.status === "supported",
    isLoading,
  };
}
