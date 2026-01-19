import { readContractsInBatch } from "@/lib/on-chain/readContractsInBatch";
import { CHAIN_ID } from "@/utils/constants";
import { useQuery } from "@tanstack/react-query";
import { Address, erc20Abi } from "viem";

export const fetchTokensBalances = async (
  account: Address,
  tokens: Address[],
): Promise<bigint[]> => {
  try {
    const balances: bigint[] = await readContractsInBatch(
      tokens.map((token) => ({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        chainId: CHAIN_ID,
        args: [account],
      })),
      CHAIN_ID,
      50,
      true,
    );
    return balances;
  } catch {
    return [];
  }
};

export const useTokensBalances = (account: Address | undefined, tokens: Address[] | undefined) => {
  return useQuery({
    enabled: !!account && tokens && tokens.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["useTokensBalances", account, tokens],
    queryFn: () => fetchTokensBalances(account!, tokens!),
  });
};
