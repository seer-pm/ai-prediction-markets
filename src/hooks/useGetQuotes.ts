import { getQuotes } from "@/lib/trade/getQuote";
import { QuoteProps } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export const useGetQuotes = ({ account, amount, tableData }: QuoteProps) => {
  const [progress, setProgress] = useState(0);
  const query = useQuery({
    enabled: !!account && amount > 0 && tableData.length > 0,
    queryKey: ["useGetQuotes", account, amount, tableData],
    queryFn: () => {
      setProgress(0)
      return getQuotes({
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
