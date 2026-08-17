import { configurePublicRpcUrls, initApiHost } from "@seer-pm/sdk";
import {
  http,
  type Chain,
  type PrivateKeyAccount,
  type PublicClient,
  createPublicClient,
  createWalletClient,
} from "viem";
import { base, gnosis, mainnet, optimism, sepolia } from "viem/chains";

export { gnosis, mainnet, optimism, base };

const GNOSIS_RPC = process.env.PRIVATE_RPC_GNOSIS || "https://gnosis-pokt.nodies.app";
const MAINNET_RPC = process.env.PRIVATE_RPC_MAINNET || "https://eth-pokt.nodies.app";
const OPTIMISM_RPC = process.env.PRIVATE_RPC_OPTIMISM || "https://mainnet.optimism.io";
const BASE_RPC = process.env.PRIVATE_RPC_BASE || "https://base.llamarpc.com";

/**
 * Seer's API host. The SDK builds every HyperIndex call as `${apiHost}/subgraph?…`, so this has
 * to point at Seer, not at us.
 *
 * Upstream reads `process.env.URL` here and that is correct *in Seer's repo*, where `URL` is
 * `https://app.seer.pm`. Ported into this repo it is actively wrong: Netlify sets `URL` to the
 * deploying site, so production would resolve to `https://deep.seer.pm/subgraph` (404, verified)
 * and `netlify dev` to `http://localhost:8899/subgraph`. Every wallet then fails its
 * `GetAccountActivity` query, and because `computeWallet` swallows per-wallet errors the refresh
 * walks the whole cursor writing nothing. Only `API_HOST` may override.
 */
initApiHost(process.env.API_HOST || "https://app.seer.pm");

configurePublicRpcUrls({
  [gnosis.id]: GNOSIS_RPC,
  [mainnet.id]: MAINNET_RPC,
  [optimism.id]: OPTIMISM_RPC,
  [base.id]: BASE_RPC,
});

const SEPOLIA_RPC = process.env.PRIVATE_RPC_SEPOLIA || "https://ethereum-sepolia-rpc.publicnode.com";

const CHAIN_BY_ID = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
  [gnosis.id]: gnosis,
  [optimism.id]: optimism,
  [base.id]: base,
} as const satisfies Record<number, Chain>;

const RPC_URL_BY_CHAIN_ID: Record<number, string> = {
  [mainnet.id]: MAINNET_RPC,
  [sepolia.id]: SEPOLIA_RPC,
  [gnosis.id]: GNOSIS_RPC,
  [optimism.id]: OPTIMISM_RPC,
  [base.id]: BASE_RPC,
};

export function getChainById(chainId: number): Chain {
  const chain = CHAIN_BY_ID[chainId as keyof typeof CHAIN_BY_ID];
  if (!chain) {
    throw new Error(`Unsupported chain id: ${chainId}`);
  }
  return chain;
}

export function getRpcUrlByChainId(chainId: number): string {
  const rpcUrl = RPC_URL_BY_CHAIN_ID[chainId];
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for chain id: ${chainId}`);
  }
  return rpcUrl;
}

export const publicClients = Object.fromEntries(
  Object.entries(CHAIN_BY_ID).map(([chainId, chain]) => [
    Number(chainId),
    createPublicClient({
      chain,
      transport: http(getRpcUrlByChainId(Number(chainId)), { batch: true }),
    }),
  ]),
);

export function getPublicClientByChainId(chainId: number | undefined): PublicClient {
  if (!chainId) {
    throw new Error("Missing chainId");
  }
  const client = publicClients[chainId];
  if (!client) {
    throw new Error(`No public client configured for chain id: ${chainId}`);
  }
  return client as PublicClient;
}

export function getWalletClientForNetwork(account: PrivateKeyAccount, chainId: number) {
  return createWalletClient({
    account,
    chain: getChainById(chainId),
    transport: http(getRpcUrlByChainId(chainId), { batch: true }),
  });
}

export const chainIds = [mainnet.id, gnosis.id, optimism.id, base.id, sepolia.id] as const;
