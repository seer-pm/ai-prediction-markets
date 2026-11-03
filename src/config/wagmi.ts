import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";
import { fallback, http } from "wagmi";
import { optimism } from "wagmi/chains";
import { resolveTheme, useThemeStore } from "../stores/themeStore";
import { OPTIMISM_RPC } from "./rpc";

const projectId = import.meta.env.VITE_WC_PROJECT_ID;

/**
 * Shared by wagmi and by the standalone session-key wallet clients. Those used to be built with a
 * bare `http()`, which resolves to optimism's public default RPC — so batches were simulated
 * against drpc but broadcast to a rate-limited endpoint with no fallback.
 */
export const OPTIMISM_TRANSPORT = fallback([
  http(OPTIMISM_RPC),
  http("https://mainnet.optimism.io"),
]);

const wagmiAdapter = new WagmiAdapter({
  networks: [optimism],
  projectId,
  transports: {
    [optimism.id]: OPTIMISM_TRANSPORT,
  },
  batch: {
    multicall: {
      wait: 20,
    },
  }
});

export const config = wagmiAdapter.wagmiConfig;

const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [optimism],
  projectId,
  features: {
    analytics: true,
  },
  // The modal renders in its own shadow root, so it cannot read the kit's CSS variables: the brand
  // purple, Open Sans and a tighter radius scale (every AppKit radius is a multiple of the master)
  // are passed in, and the light or dark mode follows the app's.
  themeMode: resolveTheme(useThemeStore.getState()),
  themeVariables: {
    "--w3m-accent": "#7d33ff",
    "--w3m-font-family": "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif",
    "--w3m-border-radius-master": "2px",
  },
});

useThemeStore.subscribe((state) => appKit.setThemeMode(resolveTheme(state)));

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
