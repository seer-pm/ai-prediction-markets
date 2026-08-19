import { getAppUrl } from "@/utils/common";
import {
  normalizeAvatarUrl,
  normalizeXHandle,
  profileSignatureMessage,
  sanitizeDisplayName,
  type Profile,
} from "@/utils/profile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useSignMessage } from "wagmi";

export interface ProfileDraft {
  displayName: string;
  avatarUrl: string;
  xHandle: string;
}

/**
 * Sign a profile and store it.
 *
 * The fields are normalised before signing, so the message the wallet shows is exactly what ends
 * up stored — no "why is my name different?" after the fact. The endpoint verifies whatever it
 * receives rather than requiring this normalisation, so the two cannot drift apart into a
 * signature mismatch.
 */
export function useSaveProfile(account: Address | undefined) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draft: ProfileDraft): Promise<Profile | null> => {
      if (!account) throw new Error("Connect a wallet first.");

      const displayName = sanitizeDisplayName(draft.displayName);
      const avatarUrl = normalizeAvatarUrl(draft.avatarUrl);
      const xHandle = normalizeXHandle(draft.xHandle);
      const issuedAt = new Date().toISOString();

      const signature = await signMessageAsync({
        account,
        message: profileSignatureMessage({ address: account, displayName, avatarUrl, xHandle, issuedAt }),
      });

      const response = await fetch(`${getAppUrl()}/.netlify/functions/save-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account, displayName, avatarUrl, xHandle, issuedAt, signature }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          errorMessage?: string;
        };
        throw new Error(body.error ?? body.errorMessage ?? `Request failed (${response.status})`);
      }

      const { profile } = (await response.json()) as { profile: Profile | null };
      return profile;
    },
    onSuccess: () => {
      // Every cached page of profiles is now potentially wrong about this wallet, and the boards
      // are small — refetch rather than mark stale, so the row updates without a navigation.
      void queryClient.invalidateQueries({ queryKey: ["useProfiles"], refetchType: "all" });
    },
  });
}
