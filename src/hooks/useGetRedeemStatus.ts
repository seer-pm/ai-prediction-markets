import { getAppUrl } from "@/utils/common";
import { useQuery } from "@tanstack/react-query";

const fetchRedeemStatus = async (): Promise<{ isRedeemable: boolean }> => {
  try {
    const response = await fetch(`${getAppUrl()}/.netlify/functions/get-redeem-status`);
    return await response.json();
  } catch {
    return { isRedeemable: false };
  }
};

/**
 * Whether Round 1 has resolved far enough to pay out. A property of the market, not of any
 * wallet.
 *
 * `staleTime` matters now that the redeem CTA hides itself on the answer: without one this
 * refetched from cold on every mount, so switching tabs flashed the button away and back while a
 * fact that changes once ever was re-fetched.
 */
export const useGetRedeemStatus = () => {
  return useQuery({
    queryKey: ["useGetRedeemStatus"],
    queryFn: fetchRedeemStatus,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};
