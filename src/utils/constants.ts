import { Token } from "@/types";
import { optimism } from "viem/chains";

export const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const SUPPORTED_CHAINS = { [optimism.id]: optimism };
export type SupportedChain = keyof typeof SUPPORTED_CHAINS;

export const AI_PREDICTION_MARKET_ID = "0xb88275fe4e2494e04cea8fb5e9d913aa48add581";

export const CHAIN_ID = 10 as SupportedChain;

export const DECIMALS = 18;

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

export const TRADE_EXECUTOR = "0x8CfFE5787082f559869170fD5bb2B434dC42A618";

export const ROUTER_ADDRESSES = {
  [optimism.id]: "0x179d8F8c811B8C759c33809dbc6c5ceDc62D05DD",
} as const;
