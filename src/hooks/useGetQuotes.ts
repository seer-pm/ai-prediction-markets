import { getQuotes } from "@/lib/trade/getQuote";
import { QuoteProps } from "@/types";
import { useQuery } from "@tanstack/react-query";

export const useGetQuotes = ({ account, amount, tableData }: QuoteProps) => {
  return useQuery({
    enabled: !!account && amount > 0 && tableData.length > 0,
    queryKey: ["useGetQuotes", account, amount, tableData],
    queryFn: () => getQuotes({ account, amount, tableData }),
  });
};
