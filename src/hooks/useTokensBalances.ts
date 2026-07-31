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

/**
 * Same read, but surfaces a failure instead of returning `[]`. Callers doing bigint arithmetic on
 * the result need this — an empty array silently yields `undefined` operands and an opaque
 * "Cannot mix BigInt and other types" TypeError further downstream.
 */
export const fetchTokensBalancesOrThrow = async (
  account: Address,
  tokens: Address[],
): Promise<bigint[]> => {
  const balances = await fetchTokensBalances(account, tokens);
  if (balances.length !== tokens.length) {
    throw new Error("Cannot read token balances, please retry");
  }
  return balances;
};

export const useTokensBalances = (account: Address | undefined, tokens: Address[] | undefined) => {
  return useQuery({
    enabled: !!account && tokens && tokens.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Show persisted/cached balances instantly, then refetch in the background on mount.
    refetchOnMount: true,
    refetchInterval: false,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: ["useTokensBalances", account, tokens],
    queryFn: () => fetchTokensBalances(account!, tokens!),
  });
};
