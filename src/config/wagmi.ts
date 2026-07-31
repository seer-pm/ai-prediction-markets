import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";
import { fallback, http } from "wagmi";
import { optimism } from "wagmi/chains";

const rpcEndpoint = (chain: string) =>
  `https://lb.drpc.org/${chain}/As_mVw7_50IPk85yNYubcezE_O23TT8R8JDnrqRhf0fE`;
const OPTIMISM_RPC = rpcEndpoint("optimism");

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

createAppKit({
  adapters: [wagmiAdapter],
  networks: [optimism],
  projectId,
  features: {
    analytics: true,
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
