import { createWeb3Modal } from "@web3modal/wagmi/react";
import { defaultWagmiConfig } from "@web3modal/wagmi/react/config";
import { fallback, http } from "wagmi";
import { optimism } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const rpcEndpoint = (chain: string) =>
  `https://lb.drpc.org/${chain}/As_mVw7_50IPk85yNYubcezE_O23TT8R8JDnrqRhf0fE`;
const OPTIMISM_RPC = rpcEndpoint("optimism");

const metadata = {
  name: "Ai Prediction Markets",
  description: "Ai Prediction Markets",
  url: "https://web3modal.com",
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
};

const projectId = import.meta.env.VITE_WC_PROJECT_ID;

export const config = defaultWagmiConfig({
  metadata,
  projectId,
  chains: [optimism],
  connectors: [injected(), walletConnect({ projectId, showQrModal: false })],
  enableCoinbase: false,
  transports: {
    [optimism.id]: fallback([http(OPTIMISM_RPC), http("https://mainnet.optimism.io")]),
  },
  ssr: true,
});

createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: true,
  themeVariables: {
    "--w3m-z-index": 1000,
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
