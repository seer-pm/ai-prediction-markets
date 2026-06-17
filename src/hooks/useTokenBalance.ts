import { config } from "@/config/wagmi";
import { CHAIN_ID } from "@/utils/constants";
import { useQuery } from "@tanstack/react-query";
import { getBalance } from "@wagmi/core";
import { Address } from "viem";

const fetchTokenBalance = async (account: Address, token: Address) => {
  return await getBalance(config, {
    address: account,
    token,
    chainId: CHAIN_ID,
  });
};

export const useTokenBalance = ({
  address,
  token,
}: {
  address: Address | undefined;
  token: Address;
}) => {
  return useQuery({
    enabled: !!address,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Show persisted/cached balance instantly, then refetch in the background on mount.
    refetchOnMount: true,
    refetchInterval: false,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["useTokenBalance", address, token],
    queryFn: () => fetchTokenBalance(address!, token),
  });
};
