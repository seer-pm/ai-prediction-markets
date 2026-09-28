import { PSM3Abi } from "@/abis/PSM3Abi";
import { config } from "@/config/wagmi";
import { CHAIN_ID, collateral, PSM3_ADDRESSES, TOKENS_BY_CHAIN } from "@/utils/constants";
import { useQuery } from "@tanstack/react-query";
import { readContract } from "@wagmi/core";
import { Address, formatUnits } from "viem";

const convertToShares = async (asset: Address, amount: bigint) => {
  return (await readContract(config, {
    address: PSM3_ADDRESSES[CHAIN_ID],
    chainId: CHAIN_ID,
    abi: PSM3Abi,
    functionName: "previewSwapExactIn",
    args: [asset, collateral.address, amount],
  })) as bigint;
};

export const useConvertToShares = ({ asset, amount }: { asset: Address; amount: bigint }) => {
  return useQuery({
    enabled: amount > 0n,
    queryKey: ["useConvertToShares", asset, amount.toString()],
    queryFn: () => convertToShares(asset, amount),
  });
};

const convertToAssets = async (asset: Address, amount: bigint) => {
  return (await readContract(config, {
    address: PSM3_ADDRESSES[CHAIN_ID],
    chainId: CHAIN_ID,
    abi: PSM3Abi,
    functionName: "previewSwapExactIn",
    args: [collateral.address, asset, amount],
  })) as bigint;
};

export const useConvertToAssets = ({ asset, amount }: { asset: Address; amount: bigint }) => {
  return useQuery({
    enabled: amount > 0n,
    queryKey: ["useConvertToAssets", asset, amount.toString()],
    queryFn: () => convertToAssets(asset, amount),
  });
};

const ONE_SUSDS = 10n ** 18n;

/**
 * Dollars per sUSDS: what the PSM pays in USDS (1:1 with the dollar) for one sUSDS. sUSDS accrues
 * the savings rate, so it drifts above 1 and a sUSDS figure understates the dollar amount.
 */
export const useSusdsUsdRate = () => {
  const { data } = useConvertToAssets({ asset: TOKENS_BY_CHAIN[CHAIN_ID].USDS, amount: ONE_SUSDS });
  return data === undefined ? undefined : Number(formatUnits(data, 18));
};
