import { PSM3Abi } from "@/abis/PSM3Abi";
import { config } from "@/config/wagmi";
import { CHAIN_ID, collateral, PSM3_ADDRESSES } from "@/utils/constants";
import { useQuery } from "@tanstack/react-query";
import { readContract } from "@wagmi/core";
import { Address } from "viem";

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
