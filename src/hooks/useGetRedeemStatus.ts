import { getAppUrl } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";

const fetchRedeemStatus = async () => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-redeem-status`);
    return await response.json();
  } catch {
    return { isRedeemable: false };
  }
};

export const useGetRedeemStatus = () => {
  return useQuery({
    queryKey: ["useGetRedeemStatus"],
    queryFn: fetchRedeemStatus,
  });
};
