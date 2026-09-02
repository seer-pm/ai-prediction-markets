import { OldTradeExecutorBytecode, TradeExecutorBytecode } from "@/abis/TradeExecutorAbi";
import { formatBytecode } from "@/utils/common";
import { CHAIN_ID, CREATE_FACTORIES, SALT_KEY } from "@/utils/constants";
import { encodeAbiParameters, encodePacked, keccak256, type Address, type Hex } from "viem";

/**
 * Deriving a participant's trade-executor addresses, without any of `executorOwners`' baggage.
 *
 * Both the leaderboard's owner map and the redeemable scan need exactly this, but importing it
 * from `./executorOwners` drags in `./pnl/config` — which builds a Supabase client and runs
 * `initApiHost()` / `configurePublicRpcUrls()` as import side effects. This file has none.
 */

/** The CREATE2 address `src/lib/on-chain/deployTradeExecutor.ts` would produce for this pair. */
export function predictExecutorAddress(owner: Address, bytecode: Hex): Address {
  const constructorData = encodeAbiParameters([{ type: "address" }], [owner]);
  const deploymentData = `${bytecode}${constructorData.slice(2)}` as Hex;
  const salt = keccak256(encodePacked(["string", "address"], [SALT_KEY, owner]));
  const hash = keccak256(
    encodePacked(
      ["bytes1", "address", "bytes32", "bytes32"],
      ["0xff", CREATE_FACTORIES[CHAIN_ID], salt, keccak256(deploymentData)],
    ),
  );
  return `0x${hash.slice(-40)}` as Address;
}

/**
 * Both executor generations, current first. People who traded before the redeploy hold positions
 * under the deprecated bytecode and never moved them, so skipping it loses those balances.
 */
export const EXECUTOR_BYTECODES = [
  formatBytecode(TradeExecutorBytecode),
  formatBytecode(OldTradeExecutorBytecode),
] as const;

/** Run `fn` over `items` with at most `concurrency` in flight, preserving input order. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) || 0 }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}
