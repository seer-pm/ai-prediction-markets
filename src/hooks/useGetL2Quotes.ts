import { getL2Quotes } from "@/lib/trade/getQuote";
import { L2QuoteProps } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export const useGetL2Quotes = ({ account, amount, tableData }: L2QuoteProps) => {
  const [progress, setProgress] = useState(0);

  const query = useQuery({
    enabled: !!account && tableData.length > 0 && Number(amount) > 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    staleTime: Infinity,
    gcTime: Infinity,
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
      return getL2Quotes({
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
