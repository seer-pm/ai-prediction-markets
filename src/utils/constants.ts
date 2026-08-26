import { Token } from "@/types";
import { optimism } from "viem/chains";

export const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const SUPPORTED_CHAINS = { [optimism.id]: optimism };
export type SupportedChain = keyof typeof SUPPORTED_CHAINS;

export const AI_PREDICTION_MARKET_ID = "0xb88275fe4e2494e04cea8fb5e9d913aa48add581";
export const ORIGINALITY_PARENT_MARKET_ID = "0xdb3aae8d1c964767eeaa17805be25cded7a17210";
export const L1_MARKET_ID = "0x3220a208aaf4d2ceecde5a2e21ec0c9145f40ba6";
export const OTHER_MARKET_ID = "0xfea47428981f70110c64dd678889826c3627245b";
export const OTHER_TOKEN_ID = "0x63a4f76ef5846f68d069054c271465b7118e8ed9";
export const L2_PARENT_MARKET_ID = "0x2d05454c1b4387b5d8be84bee20d58390a01ca64";
export const OCTANT_MARKET_ID = "0xe85ada7cd6d33cb41ac596fb4749e3f94d836ece";

// Zcash Q3 2026 is the first contest with no parent market: 37 independent top-level binaries,
// collateralized in sUSDS directly. The ids live in `zcashMarkets.ts` next to the ballot metadata
// the predictions CSV joins against; re-exported here so `contests.ts` has one import site.
export { ZCASH_MARKET_IDS } from "./zcashMarkets";

export const CHAIN_ID = 10 as SupportedChain;

/**
 * Seer's market list, filtered to our chain. The list page reads a repeatable `chains` param, so
 * this is the whole filter.
 *
 * Deliberately not a link to a specific market. Slugs live in Seer's Supabase `markets` table and
 * are written by a cron over the rows it has; the 37 Zcash markets are not in that table, so they
 * have no slug — Seer's own `paths.market` falls back to `markets/<chainId>/<address>` for exactly
 * this case. A contest-level link would have to pick one of the 37 arbitrarily, so it points at the
 * list instead.
 */
export const SEER_MARKETS_URL = `https://app.seer.pm/?chains=${CHAIN_ID}`;

// Optimism enforces a hard per-transaction gas-limit cap of 2^24. Any tx with a
// higher gas limit is rejected by the sequencer with "gas limit too high".
export const OPTIMISM_MAX_TX_GAS = 16_777_216n; // 2^24

export const DECIMALS = 18;

export const SALT_KEY = "TradeExecutorV1";

export const VOLUME_MIN = 0.01;

export const MIN_PRICE = 0.00000001;

// Minimum UP+DOWN excess over 1 for the mint-and-sell-both arbitrage to clear
// the ~2% round-trip Uniswap fee (1% per leg).
export const ARB_SUM_THRESHOLD = 0.02;

/**
 * The price a Zcash prediction aims a pool at.
 *
 * A yes/no call carries no number, but `getVolumeUntilPrice` needs a target. 1.0 is unusable: the
 * volume to push a pool to certainty is unbounded. 0.95 is confident without being degenerate, and
 * it still leaves a real gap on a market trading at 0.9 — which is where the remaining money is.
 */
export const ZCASH_TARGET_PRICE = 0.95;

type CollateralTokensMap = Record<
  SupportedChain,
  { primary: Token; secondary: Token | undefined; swap?: Token[] }
>;

export const TOKENS_BY_CHAIN = {
  [optimism.id]: {
    sUSDS: "0xb5b2dc7fd34c249f4be7fb1fcea07950784229e0",
    USDS: "0x4f13a96ec5c4cf34e442b46bbd98a0791f20edc3",
    USDC: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
  },
} as const;

export const COLLATERAL_TOKENS: CollateralTokensMap = {
  [optimism.id]: {
    primary: { address: TOKENS_BY_CHAIN[optimism.id].sUSDS, symbol: "sUSDS", decimals: 18 },
    secondary: undefined,
    swap: [
      { address: TOKENS_BY_CHAIN[optimism.id].USDS, symbol: "USDS", decimals: 18 },
      { address: TOKENS_BY_CHAIN[optimism.id].USDC, symbol: "USDC", decimals: 6 },
    ],
  },
} as const;

export const collateral = COLLATERAL_TOKENS[CHAIN_ID].primary;

export const CREATE_FACTORIES = {
  [optimism.id]: "0x6F6537809831605f6920eF623B9dd8a6036bbc60",
} as const;

export const CONDITIONAL_TOKENS = {
  [optimism.id]: "0x8bdC504dC3A05310059c1c67E0A2667309D27B93",
} as const;

export const ROUTER_ADDRESSES = {
  [optimism.id]: "0x179d8F8c811B8C759c33809dbc6c5ceDc62D05DD",
} as const;

export const UNISWAP_ROUTER_ADDRESSES = {
  [optimism.id]: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
} as const;

export const QUOTER_V2_ADDRESSES = {
  [optimism.id]: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
} as const;

export const PSM3_ADDRESSES = {
  [optimism.id]: "0xe0F9978b907853F354d79188A3dEfbD41978af62",
} as const;
