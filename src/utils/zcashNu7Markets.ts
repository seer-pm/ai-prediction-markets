import { Address } from "viem";

/**
 * The Zcash NU7 coinholder poll market set: 5 independent categorical (single-select) markets on
 * Optimism, one per ballot question, created 2026-09-03 and seeded with 2,000 sUSDS each.
 *
 * Generated from `zcash-nu7-markets.json` in the liquidity repo. Static rather than discovered at
 * runtime for the same reason as `zcashMarkets.ts`: these markets are **not in Seer's `markets`
 * table**, so there is no query that would find them. `get-zcash-nu7-markets-data` reads MarketView
 * on chain using these ids.
 *
 * Unlike the grants set these are *categorical*, not binary: each carries 3-4 substantive outcomes
 * plus Invalid, and the substantive prices sum to ~1 within a market. Only the address and the
 * ballot label live here. Outcome strings, wrapped tokens and the question text all come back from
 * MarketView, and that on-chain order is the only ordering `redeemPositions` and the pool lookups
 * may index against — copying outcomes into this file would invite the two to drift.
 *
 * Note this file is reached from a Netlify function (via `netlify/functions/utils/zcashNu7OnChain`),
 * so it must import nothing but `viem` types — see the header comment in `./contests`.
 */
export interface ZcashNu7Market {
  /** 1-based question number on the ballot. */
  id: number;
  address: Address;
  /** Ballot label, e.g. "Q1". Drives the wrapped ERC20 symbols (ZNU7Q1*). */
  shortName: string;
  /** Short human topic, for the card header. The full question comes from `marketName` on chain. */
  topic: string;
}

/**
 * Outcome count varies by market — Q4 is a yes/no/abstain with 4 total, the rest have 5 — so
 * nothing may hardcode an index. What *is* constant across the set is that **Invalid is last**:
 * derive it as `wrappedTokens.length - 1`.
 */
export const invalidIndexOf = (outcomes: readonly unknown[]) => outcomes.length - 1;

export const ZCASH_NU7_MARKETS: readonly ZcashNu7Market[] = [
  {
    id: 1,
    address: "0xF3f00A5Ecc66Bd6EbF32B6fd46bfb8F25289A4aA",
    shortName: "Q1",
    topic: "NSM Issuance Smoothing",
  },
  {
    id: 2,
    address: "0x1CDDEAEd87aeA58BCee8053EfE413a12537F881A",
    shortName: "Q2",
    topic: "NSM Reissuance Start Date",
  },
  {
    id: 3,
    address: "0x9C003F4627D0563359664e8F0B208f354f7acDfF",
    shortName: "Q3",
    topic: "Sprout Deprecation",
  },
  {
    id: 4,
    address: "0x685d5C8F56e3722f3030Bc0102954dF541541aEb",
    shortName: "Q4",
    topic: "Faster Block Times (ZIP-218)",
  },
  {
    id: 5,
    address: "0x1e3F03Cd6231027bccf02791483156Bb4a96D6C9",
    shortName: "Q5",
    topic: "NU7 Scope and Readiness",
  },
] as const;

export const ZCASH_NU7_MARKET_IDS: readonly Address[] = ZCASH_NU7_MARKETS.map(
  (market) => market.address,
);

/** Case-insensitive: MarketView echoes the address back checksummed, our list is checksummed too, but callers compare against subgraph ids which are lowercase. */
const addressToMarket = new Map(
  ZCASH_NU7_MARKETS.map((market) => [market.address.toLowerCase(), market]),
);

export function getZcashNu7Market(address: string): ZcashNu7Market | undefined {
  return addressToMarket.get(address.trim().toLowerCase());
}
