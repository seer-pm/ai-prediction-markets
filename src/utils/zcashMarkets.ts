import { Address } from "viem";

/**
 * The Zcash Q3 2026 CDRGP market set: 37 independent binary markets on Optimism, one per proposal
 * in the Coinholder-Directed Retroactive Grants Program.
 *
 * Generated from `create-zcash-markets-execution.json` in the liquidity repo (37/37 created and
 * verified on 2026-08-19). Kept as a static list rather than discovered at runtime for two reasons:
 *
 * 1. These markets are **not in Seer's `markets` table** — the indexer has nothing for them, so
 *    there is no query that would find them. `get-zcash-markets-data` reads MarketView on chain
 *    using these ids.
 * 2. It makes `title` the join key for the predictions CSV. The other contests join a CSV row
 *    against an on-chain outcome string, where any drift silently yields a row with no prediction
 *    and no error. Here the titles live in one place and the CSV is validated against them.
 *
 * Unlike Originality's scalar pairs these are top-level markets collateralized in sUSDS directly —
 * there is no parent market, which is why the mint budget has to be divided across them rather
 * than replicated.
 */
export interface ZcashMarket {
  /** 1-based proposal number on the ballot. */
  id: number;
  address: Address;
  /** Proposal title, verbatim from the forum. The predictions CSV joins on this. */
  title: string;
  /** Drives the wrapped ERC20 symbols (ZQ3<shortName>YES / ZQ3<shortName>NO). */
  shortName: string;
  applicant: string;
  requestedUsd: number;
  tier: "under25k" | "mid" | "over150k";
}

/**
 * Outcome order on chain is `["Yes", "No", "Invalid result"]`, so `wrappedTokens` is
 * `[YES, NO, INVALID]`. This is the reverse of Originality's `[DOWN, UP, INVALID]` — index
 * through these constants rather than by literal, the two contests disagree.
 */
export const YES_INDEX = 0;
export const NO_INDEX = 1;
export const INVALID_INDEX = 2;

export const ZCASH_MARKETS: readonly ZcashMarket[] = [
  {
    id: 1,
    address: "0xe599669a0cb02128fa0463953f9f70fde240921a",
    title: "Zcash Grants Hub",
    shortName: "GRANTSHUB",
    applicant: "Daniel Goh",
    requestedUsd: 3050,
    tier: "under25k",
  },
  {
    id: 2,
    address: "0xbdb8245fb6e4c6df77bb6b28af7c7691572805ec",
    title: "ShieldedScan",
    shortName: "SHIELDEDSCAN",
    applicant: "ShieldedScan",
    requestedUsd: 4060,
    tier: "under25k",
  },
  {
    id: 3,
    address: "0x8f62c36678044f5be39de143c01d652919e59a31",
    title: "ZecKit Post-M3 Stabilization and Developer Adoption",
    shortName: "ZECKIT",
    applicant: "Dapps over Apps",
    requestedUsd: 5000,
    tier: "under25k",
  },
  {
    id: 4,
    address: "0xdc8cde1236921607e18382710d42de2a8ccdd491",
    title: "zcashtocash via ZcashLabs",
    shortName: "ZCASHTOCASH",
    applicant: "ZcashLabs",
    requestedUsd: 6000,
    tier: "under25k",
  },
  {
    id: 5,
    address: "0x55094376a3283512a8144fa9a251e430195286e2",
    title: "zec-ironwood-reconcile",
    shortName: "RECONCILE",
    applicant: "Steven Hert",
    requestedUsd: 8250,
    tier: "under25k",
  },
  {
    id: 6,
    address: "0xace4327ac96e15040474065dc6aa0da0751bcbca",
    title: "Gleyo",
    shortName: "GLEYO",
    applicant: "Gleyo",
    requestedUsd: 9081.2,
    tier: "under25k",
  },
  {
    id: 7,
    address: "0xb4485e5404178444fbf3f279eddf2b5c4b421e39",
    title: "Self-Sovereign Zcash Testnet Faucet",
    shortName: "FAUCET",
    applicant: "Jino Labs",
    requestedUsd: 9280,
    tier: "under25k",
  },
  {
    id: 8,
    address: "0xe3a5794dfdcccbc964574bc6a5e3cab92f198f03",
    title: "CyphZec.com",
    shortName: "CYPHZEC",
    applicant: "Thomas Zarebczan",
    requestedUsd: 10000,
    tier: "under25k",
  },
  {
    id: 9,
    address: "0xff4553ad2539b2722b322d10930f1b85969dee6a",
    title: "ZecLedger",
    shortName: "ZECLEDGER",
    applicant: "ZecLedger",
    requestedUsd: 10000,
    tier: "under25k",
  },
  {
    id: 10,
    address: "0xd058cc42d014810b15a93874b3f11b02bfad9732",
    title: "lightwalletd-rs",
    shortName: "LIGHTWALLETD",
    applicant: "jpgonzalezra",
    requestedUsd: 10720,
    tier: "under25k",
  },
  {
    id: 11,
    address: "0x5395fd696b64d1d3e9295e09bfaf038e0c8f05f6",
    title: "Blindvault",
    shortName: "BLINDVAULT",
    applicant: "TIDJANI Walid",
    requestedUsd: 17000,
    tier: "under25k",
  },
  {
    id: 12,
    address: "0x781fc94cf2a362c29cb08c86f8dcd1ea8181a158",
    title: "Zallet RPC Parity Harness",
    shortName: "ZALLETRPC",
    applicant: "Creativesonchain",
    requestedUsd: 20000,
    tier: "under25k",
  },
  {
    id: 13,
    address: "0x78a72380c7936f2cb3574d2302e8437aeebab93c",
    title: "Zecmap",
    shortName: "ZECMAP",
    applicant: "Batuhan",
    requestedUsd: 21300,
    tier: "under25k",
  },
  {
    id: 14,
    address: "0x64a3ab58337ca2d6ddcdd6ab6712b3e57626ee1f",
    title: "Connaugh Zcash Videos",
    shortName: "CONNAUGH",
    applicant: "Connaugh",
    requestedUsd: 22000,
    tier: "under25k",
  },
  {
    id: 15,
    address: "0x0586c5bf8a0137d3da895e59663b760b5e39c340",
    title: "ZAP1 Attestation Protocol and Verification Tooling",
    shortName: "ZAP1",
    applicant: "Frontier Compute",
    requestedUsd: 28000,
    tier: "mid",
  },
  {
    id: 16,
    address: "0x140654d12ac41a2d946e6dec85d07a0252b0bf20",
    title: "ZecBooks",
    shortName: "ZECBOOKS",
    applicant: "SaneApps",
    requestedUsd: 32000,
    tier: "mid",
  },
  {
    id: 17,
    address: "0x0900986e76a3a75ce4dfd3615aaa5e388d1a7870",
    title: "CipherPay",
    shortName: "CIPHERPAY",
    applicant: "Atmosphere Labs (Kenbak)",
    requestedUsd: 35000,
    tier: "mid",
  },
  {
    id: 18,
    address: "0x725337ef90be0a5a7064098d6a0191d93f8c1b70",
    title: "Zafu Browser Extension",
    shortName: "ZAFU",
    applicant: "Rotko Networks OU",
    requestedUsd: 38000,
    tier: "mid",
  },
  {
    id: 19,
    address: "0x06277fcef6340930b0f08b90032edaf07ce36b6a",
    title: "Zapp",
    shortName: "ZAPP",
    applicant: "Renee Chiu",
    requestedUsd: 40000,
    tier: "mid",
  },
  {
    id: 20,
    address: "0xa58c14daf5c0f14adfe08b2c672ab361948758d2",
    title: "Open-Source Zcash Hardware-Wallet SDK",
    shortName: "HWSDK",
    applicant: "wh00hw",
    requestedUsd: 40000,
    tier: "mid",
  },
  {
    id: 21,
    address: "0x45ef7f50825619aea0070d7d0147dae5a26fc50b",
    title: "Nozy Wallet",
    shortName: "NOZY",
    applicant: "Leonine DAO",
    requestedUsd: 60000,
    tier: "mid",
  },
  {
    id: 22,
    address: "0x777b50f83e76acd9e520abf6a258cc218b1ad054",
    title: "THORSwap / Metro",
    shortName: "THORSWAP",
    applicant: "THORSwap Labs",
    requestedUsd: 60000,
    tier: "mid",
  },
  {
    id: 23,
    address: "0x404ccb09e7f47de56b64253d9e2f839d555366b8",
    title: "Expanding Zcash In Unstoppable Wallet",
    shortName: "UNSTOPPABLE",
    applicant: "Horizontal Systems",
    requestedUsd: 80000,
    tier: "mid",
  },
  {
    id: 24,
    address: "0xb6bb6a1e1f02a11afae1de272c94a78bd4673f37",
    title: "ZcashNames",
    shortName: "ZCASHNAMES",
    applicant: "ZcashMe, Inc.",
    requestedUsd: 122400,
    tier: "mid",
  },
  {
    id: 25,
    address: "0x751047dc87049eb122cdbf570a591eceeb81b984",
    title: "Frontier Compute Zcash Security Research and Remediation Pack",
    shortName: "FRONTIERSEC",
    applicant: "Frontier Compute LLC",
    requestedUsd: 136250,
    tier: "mid",
  },
  {
    id: 26,
    address: "0xda375fa265997b5b408fa94d9c834693861bceca",
    title: "Zebra Critical Vulnerability Bug Bounty (CVE-2026-34202)",
    shortName: "ZEBRACVE",
    applicant: "robustfengbin",
    requestedUsd: 150000,
    tier: "mid",
  },
  {
    id: 27,
    address: "0xddbe118c992fc4165291ead70b64c33db037eb67",
    title: "Bonus Grant - Ironwood zk-SNARK Formal Verification",
    shortName: "BONUSIRONWOOD",
    applicant: "Jason McGee",
    requestedUsd: 261058,
    tier: "over150k",
  },
  {
    id: 28,
    address: "0x73d8a605e090c267d18506a2eeef5b0a6d22fae9",
    title: "CipherScan",
    shortName: "CIPHERSCAN",
    applicant: "Kenbak",
    requestedUsd: 375000,
    tier: "over150k",
  },
  {
    id: 29,
    address: "0xc0e29b80a74287cfef882a4d425d06117aa09c07",
    title: "Temporary Detectable Unlimited Mint and Sell Exploit",
    shortName: "MINTEXPLOIT",
    applicant: "Alex Sol",
    requestedUsd: 400000,
    tier: "over150k",
  },
  {
    id: 30,
    address: "0xe7d2d53d782b13d1de2361ae458367eb3a85b191",
    title: "Five Critical Zebra Consensus Divergence Vulnerabilities",
    shortName: "ZEBRACONSENSUS",
    applicant: "sangsoo-osec",
    requestedUsd: 425000,
    tier: "over150k",
  },
  {
    id: 31,
    address: "0x91736993fd987c230244825a27c3e531c66fe63b",
    title: "Zec.rocks (16 months of uptime)",
    shortName: "ZECROCKS",
    applicant: "Zec.rocks",
    requestedUsd: 584992,
    tier: "over150k",
  },
  {
    id: 32,
    address: "0x6a2efde79d7e7df689cb17fd0663b3455d838dd4",
    title: "Ironwood external audit reimbursement",
    shortName: "VALARAUDIT",
    applicant: "ValarGroup",
    requestedUsd: 599000,
    tier: "over150k",
  },
  {
    id: 33,
    address: "0x74a5f36e0af651a1e577b40c2167ac62fd4012d7",
    title: "Ironwood zk-SNARK Formal Verification (Project Tachyon)",
    shortName: "TACHYON",
    applicant: "Tachyon Foundation",
    requestedUsd: 738942,
    tier: "over150k",
  },
  {
    id: 34,
    address: "0xd2dc10fa13cac63abfc098e7be89214eba6c38ec",
    title: "Orchard Counterfeiting Vulnerability Bug Bounty",
    shortName: "ORCHARDBOUNTY",
    applicant: "Taylor Hornby",
    requestedUsd: 750000,
    tier: "over150k",
  },
  {
    id: 35,
    address: "0xbfa2f5855527b8fa1fdb648065fc172ea41c6d94",
    title: "Bonus Grant - Orchard Counterfeiting Bug Bounty",
    shortName: "BONUSORCHARD",
    applicant: "Jason McGee",
    requestedUsd: 750000,
    tier: "over150k",
  },
  {
    id: 36,
    address: "0x8dfd98175eaeb4c512113f88eccba1c9bd281742",
    title: "ValarGroup Ironwood Work",
    shortName: "VALARIRONWOOD",
    applicant: "ValarGroup",
    requestedUsd: 1203000,
    tier: "over150k",
  },
  {
    id: 37,
    address: "0x2766ef544445b8247adb241a5c2792aac31ef133",
    title: "ZODL Q1 2026 Core Protocol Development",
    shortName: "ZODL",
    applicant: "ZODL",
    requestedUsd: 1950000,
    tier: "over150k",
  },
] as const;

export const ZCASH_MARKET_IDS: readonly Address[] = ZCASH_MARKETS.map((market) => market.address);

/**
 * The 30-day review thread. It carries every proposal, the tier totals and the voting rules, so it
 * is what a user should be reading before they mark a row approve or reject.
 */
export const ZCASH_FORUM_URL =
  "https://forum.zcashcommunity.com/t/30-day-review-period-coinholder-directed-retroactive-grants-program-q3/57056";

/** Total requested across the ballot, in USD. Reconciles with the forum's tier totals. */
export const ZCASH_TOTAL_REQUESTED_USD = ZCASH_MARKETS.reduce(
  (total, market) => total + market.requestedUsd,
  0,
);

const titleToMarket = new Map(ZCASH_MARKETS.map((market) => [market.title.toLowerCase(), market]));

/** Case-insensitive lookup used to validate predictions CSV rows against the ballot. */
export function getZcashMarketByTitle(title: string): ZcashMarket | undefined {
  return titleToMarket.get(title.trim().toLowerCase());
}
