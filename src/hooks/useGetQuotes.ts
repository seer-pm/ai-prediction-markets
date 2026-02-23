import { getL1SellQuotes } from "@/lib/trade/getQuote";
import { QuoteProps } from "@/types";
import { DECIMALS, VOLUME_MIN } from "@/utils/constants";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";

export const useGetQuotes = ({ account, amount, tableData }: QuoteProps) => {
  const [progress, setProgress] = useState(0);
  const isEnabled = !!tableData.find((row) => {
    const isSellable = row.hasPrediction && row.difference && row.difference < 0;
    if (!isSellable) return false;
    const availableSellVolume = parseUnits(amount, DECIMALS) + (row.balance ?? 0n);
    const volume =
      parseUnits(row.volumeUntilPrice.toFixed(15), DECIMALS) > availableSellVolume
        ? formatUnits(availableSellVolume, DECIMALS)
        : row.volumeUntilPrice.toFixed(15);
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
      "useGetQuotes",
      account,
      amount,
      tableData.map((data) => ({ ...data, balance: data.balance?.toString() })),
    ],
    queryFn: () => {
      setProgress(0);
      return getL1SellQuotes({
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
