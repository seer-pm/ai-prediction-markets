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

export const CHAIN_ID = 10 as SupportedChain;

export const DECIMALS = 18;

export const SALT_KEY = "TradeExecutorV1";

export const VOLUME_MIN = 0.01;

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
