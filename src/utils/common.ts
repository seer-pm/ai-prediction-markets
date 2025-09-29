import { TickMath } from "@uniswap/v3-sdk";
import { Address, encodePacked, formatUnits, Hex, keccak256 } from "viem";

export function getAppUrl() {
  if (typeof window !== "undefined" && !window.location.host.includes("localhost")) {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return import.meta.env.VITE_WEBSITE_URL || "https://deep-pm.netlify.app";
}

export type Token0Token1 = { token1: Address; token0: Address };

export function getToken0Token1(token0: Address, token1: Address): Token0Token1 {
  return token0.toLocaleLowerCase() > token1.toLocaleLowerCase()
    ? {
        token0: token1.toLocaleLowerCase() as Address,
        token1: token0.toLocaleLowerCase() as Address,
      }
    : {
        token0: token0.toLocaleLowerCase() as Address,
        token1: token1.toLocaleLowerCase() as Address,
      };
}

export function isTwoStringsEqual(
  str1: string | undefined | null,
  str2: string | undefined | null
) {
  return !!str1?.trim() && str2?.trim()?.toLocaleLowerCase() === str1?.trim()?.toLocaleLowerCase();
}

export function tickToTokenPrices(tick: number, decimals = 18) {
  const sqrtPriceX96 = BigInt(TickMath.getSqrtRatioAtTick(tick).toString());

  const TWO_POW_96 = 2n ** 96n;
  const TEN_POW_DECIMALS = 10n ** BigInt(decimals);

  const price0 = (sqrtPriceX96 * sqrtPriceX96 * TEN_POW_DECIMALS) / (TWO_POW_96 * TWO_POW_96);
  const price1 = (TWO_POW_96 * TWO_POW_96 * TEN_POW_DECIMALS) / (sqrtPriceX96 * sqrtPriceX96);

  return [Number(formatUnits(price0, decimals)), Number(formatUnits(price1, decimals))];
}

export function sqrtPriceX96ToTokenPrices(sqrtPriceX96: bigint, decimals = 18) {
  const TWO_POW_96 = 2n ** 96n;
  const TEN_POW_DECIMALS = 10n ** BigInt(decimals);

  const price0 = (sqrtPriceX96 * sqrtPriceX96 * TEN_POW_DECIMALS) / (TWO_POW_96 * TWO_POW_96);
  const price1 = (TWO_POW_96 * TWO_POW_96 * TEN_POW_DECIMALS) / (sqrtPriceX96 * sqrtPriceX96);

  [Number(formatUnits(price0, decimals)), Number(formatUnits(price1, decimals))];
}

export function decimalToFraction(x: number): [string, string] {
  const str = x.toString();
  if (!str.includes(".")) return [String(x), "1"];
  const decimals = str.split(".")[1].length;
  const numerator = Math.round(x * 10 ** decimals);
  const denominator = 10 ** decimals;
  return [String(numerator), String(denominator)];
}

export function generateSalt(ownerAddress: Hex): Hex {
  return keccak256(encodePacked(["string", "address"], ["TradeExecutor_v1", ownerAddress]));
}

export function formatBytecode(bytecode: string): Hex {
  // Remove any whitespace
  const cleaned = bytecode.trim();

  // Add 0x prefix if not present
  if (!cleaned.startsWith("0x")) {
    return `0x${cleaned}` as Hex;
  }

  return cleaned as Hex;
}

export function minBigIntArray(values: bigint[]): bigint {
  if (values.length === 0) {
    throw new Error("Cannot compute min of empty array");
  }
  return values.reduce((min, v) => (v < min ? v : min));
}