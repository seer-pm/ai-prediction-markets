import { getOriginalityQuotes } from "@/lib/trade/getQuote";
import { OriginalityQuoteProps } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export const useGetOriginalityQuotes = ({ account, amount, tableData }: OriginalityQuoteProps) => {
  const [progress, setProgress] = useState(0);
  
  const query = useQuery({
    enabled: !!account && tableData.length > 0,
    retry: false,
    queryKey: [
      "useGetOriginalityQuotes",
      account,
      amount,
      tableData.map((data) => ({ ...data, upBalance: data.upBalance?.toString(), downBalance: data.downBalance?.toString() })),
    ],
    queryFn: () => {
      setProgress(0);
      return getOriginalityQuotes({
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
