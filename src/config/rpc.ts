/**
 * RPC endpoints, kept out of `wagmi.ts` because that module runs `createAppKit()` as a side effect
 * at import time. Leaf modules that only need a URL (e.g. the read-only ENS client) must not drag
 * the connect modal in behind them, and duplicating the drpc key is worse.
 */

const rpcEndpoint = (chain: string) =>
  `https://lb.drpc.org/${chain}/As_mVw7_50IPk85yNYubcezE_O23TT8R8JDnrqRhf0fE`;

export const OPTIMISM_RPC = rpcEndpoint("optimism");

/** Ethereum mainnet — read-only, used solely for ENS reverse resolution. */
export const MAINNET_RPC = rpcEndpoint("ethereum");
