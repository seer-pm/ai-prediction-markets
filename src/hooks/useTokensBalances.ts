import { readContractsInBatch } from "@/lib/on-chain/readContractsInBatch";
import { CHAIN_ID, DECIMALS } from "@/utils/constants";
import { useQuery } from "@tanstack/react-query";
import { Address, erc20Abi, formatUnits } from "viem";

interface GetBalancesResult {
  [key: string]: number;
}

const fetchTokensBalances = async (
  account: Address,
  tokens: Address[]
): Promise<GetBalancesResult> => {
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
      true
    );
    return balances.reduce((acc, curr, index) => {
      acc[tokens[index]] = Number(formatUnits(curr, DECIMALS));
      return acc;
    }, {} as GetBalancesResult);
  } catch {
    return {} as GetBalancesResult;
  }
};

export const useTokensBalances = (account: Address | undefined, tokens: Address[] | undefined) => {
  return useQuery({
    enabled: !!account && tokens && tokens.length > 0,
    queryKey: ["useTokensBalances", account, tokens],
    queryFn: () => fetchTokensBalances(account!, tokens!),
  });
};
