import { getL2SellQuotes } from "@/lib/trade/getQuote";
import { L2QuoteProps } from "@/types";
import { DECIMALS, VOLUME_MIN } from "@/utils/constants";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";

export const useGetL2Quotes = ({ account, amount, tableData }: L2QuoteProps) => {
  const [progress, setProgress] = useState(0);
  const isEnabled = !!tableData.find((row) => {
    const isSellable = row.hasPrediction && row.difference && row.difference < 0;
    if (!isSellable) return false;
    const availableSellVolume = parseUnits(amount, DECIMALS) + (row.balance ?? 0n);
    const volume =
      parseUnits(row.volumeUntilPrice.toString(), DECIMALS) > availableSellVolume
        ? formatUnits(availableSellVolume, DECIMALS)
        : row.volumeUntilPrice.toString();
    if (Number(volume) < VOLUME_MIN) {
      return false;
    }
    return true;
  });
  const query = useQuery({
    enabled: !!account && tableData.length > 0 && isEnabled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryKey: [
      "useGetL2Quotes",
      account,
      amount,
      tableData
        .map((data) => `${data.dependency}-${data.repo}`)
        .sort((a, b) => {
          return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
        }),
    ],
    queryFn: () => {
      setProgress(0);
      return getL2SellQuotes({
        account,
        amount,
        tableData,
        onProgress: (current) => {
          setProgress(current);
        },
      });
    },
  });

  return {
    ...query,
    progress,
  };
};
