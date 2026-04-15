import { create } from "zustand";
import { persist } from "zustand/middleware";

type WalletStore = {
  isUseOldWallet: boolean;
  toggleIsUseOldWallet: () => void;
};

export const useWalletStore = create<WalletStore>()(
  persist(
    (set) => ({
      isUseOldWallet: false, // default value
      toggleIsUseOldWallet: () =>
        set((state) => ({
          isUseOldWallet: !state.isUseOldWallet,
        })),
    }),
    {
      name: "wallet-storage", // key in localStorage
    },
  ),
);
