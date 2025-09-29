import { getQuotes } from "@/lib/trade/getQuote";
import { QuoteProps } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export const useGetQuotes = ({ account, amount, tableData }: QuoteProps) => {
  const [progress, setProgress] = useState(0);
  const query = useQuery({
    enabled: !!account && Number(amount) > 0 && tableData.length > 0,
    retry: false,
    queryKey: [
      "useGetQuotes",
      account,
      amount,
      tableData.map((data) => ({ ...data, balance: data.balance?.toString() })),
    ],
    queryFn: () => {
      setProgress(0);
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
