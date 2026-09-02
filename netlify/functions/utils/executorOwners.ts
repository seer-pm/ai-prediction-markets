import { CHAIN_ID } from "@/utils/constants";
import { createClient } from "@supabase/supabase-js";
import { getAddress, zeroAddress, type Address } from "viem";
import { EXECUTOR_BYTECODES, mapPool, predictExecutorAddress } from "./executorAddress";
import { getPublicClientByChainId } from "./pnl/config";

const supabase = createClient(process.env.SUPABASE_PROJECT_URL!, process.env.SUPABASE_API_KEY!);

/**
 * Executor contract → the EOA that owns it.
 *
 * One participant holds positions under more than one address: this app deploys a CREATE2
 * `TradeExecutor` per user (`src/lib/on-chain/deployTradeExecutor.ts`) and separately supports
 * EIP-7702, and many people used both the current and the deprecated executor bytecode.
 *
 * The map is built by **deriving** each owner's CREATE2 addresses and keeping the ones with
 * bytecode, not by reverse-resolving addresses we already see. That matters: the indexer keys
 * activity by the EOA that sent the transaction, so executor contracts appear on no leaderboard
 * at all even though they are the accounts actually holding the outcome tokens — 38 of them are
 * deployed here, one with 211 open positions and +921 sUSDS on a single contest. Without the
 * derivation their P/L is silently dropped rather than merely split across two rows.
 *
 * `owner()` is still checked, as a cross-check and to catch an executor deployed with a salt we
 * no longer derive.
 */

export const OWNER_MAP_KEY = `deep_pm_leaderboard_owners_${CHAIN_ID}`;

/** `0xef0100 || address` — EIP-7702 delegation. The account is still the user's own EOA. */
const EIP_7702_PREFIX = "0xef0100";

/**
 * Just `owner()`. `@/abis/TradeExecutorAbi` is not declared `as const`, so viem cannot infer a
 * return type from it; this is also the whole surface we need, and it matches both the current
 * and the deprecated executor bytecode.
 */
const OWNER_ABI = [
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export type OwnerMap = Record<string, string>;

interface StoredOwnerMap {
  updatedAt: string;
  owners: OwnerMap;
}

/**
 * Collapse an address to the identity it should be ranked under. Unknown addresses — EOAs,
 * 7702-delegated EOAs, Safes, anything without an `owner()` — map to themselves.
 */
export function canonicalAddress(address: string, owners: OwnerMap): string {
  const lower = address.toLowerCase();
  return owners[lower] ?? lower;
}

export async function readOwnerMap(): Promise<OwnerMap> {
  const { data, error } = await supabase
    .from("key_value")
    .select("value")
    .eq("key", OWNER_MAP_KEY)
    .maybeSingle();
  if (error) throw error;
  return (data?.value as StoredOwnerMap | undefined)?.owners ?? {};
}

async function writeOwnerMap(owners: OwnerMap): Promise<void> {
  const { error } = await supabase.from("key_value").upsert(
    { key: OWNER_MAP_KEY, value: { updatedAt: new Date().toISOString(), owners } satisfies StoredOwnerMap },
    { onConflict: "key" },
  );
  if (error) throw error;
}

const CODE_CONCURRENCY = 10;
const OWNER_BATCH = 50;

/**
 * Rebuild the map for `addresses` and store it.
 *
 * Derive each address's executor addresses, keep the ones that have bytecode, and confirm
 * ownership with `owner()`. Addresses whose own code is a 7702 delegation are left alone — they
 * have bytecode but they *are* the participant, so rolling them into anything would be wrong.
 */
export async function refreshOwnerMap(addresses: string[]): Promise<OwnerMap> {
  const unique = [...new Set(addresses.map((address) => address.toLowerCase()))];
  if (unique.length === 0) return {};

  const client = getPublicClientByChainId(CHAIN_ID);

  const candidates: { executor: string; owner: string }[] = [];
  for (const owner of unique) {
    for (const bytecode of EXECUTOR_BYTECODES) {
      const executor = predictExecutorAddress(owner as Address, bytecode).toLowerCase();
      if (executor !== owner) candidates.push({ executor, owner });
    }
  }

  const deployed = (
    await mapPool(candidates, CODE_CONCURRENCY, async (candidate) => {
      try {
        const code = await client.getCode({ address: candidate.executor as Address });
        return code && code !== "0x" ? candidate : null;
      } catch {
        return null;
      }
    })
  ).filter((candidate): candidate is { executor: string; owner: string } => candidate !== null);

  const owners: OwnerMap = {};
  for (const { executor, owner } of deployed) {
    owners[executor] = owner;
  }

  // Anything that turned up as an address in its own right and has non-7702 bytecode: ask it
  // directly. Catches an executor deployed with a salt this build no longer derives.
  const selfCodes = await mapPool(unique, CODE_CONCURRENCY, async (address) => {
    try {
      const code = await client.getCode({ address: address as Address });
      return { address, code: code ?? "0x" };
    } catch {
      return { address, code: "0x" };
    }
  });

  const contracts = selfCodes
    .filter(({ code }) => code !== "0x" && !code.toLowerCase().startsWith(EIP_7702_PREFIX))
    .map(({ address }) => address)
    .filter((address) => !owners[address]);

  for (let i = 0; i < contracts.length; i += OWNER_BATCH) {
    const batch = contracts.slice(i, i + OWNER_BATCH);
    const results = await client.multicall({
      allowFailure: true,
      contracts: batch.map((address) => ({
        address: address as Address,
        abi: OWNER_ABI,
        functionName: "owner" as const,
      })),
    });
    results.forEach((result, index) => {
      if (result.status !== "success") return;
      const owner = result.result as Address | undefined;
      // A contract that answers `owner()` but points at nothing, or at itself, tells us nothing.
      if (!owner || owner === zeroAddress) return;
      const ownerLc = getAddress(owner).toLowerCase();
      if (ownerLc === batch[index]) return;
      owners[batch[index]] = ownerLc;
    });
  }

  await writeOwnerMap(owners);
  console.log(
    `owner map: ${unique.length} owners, ${deployed.length} derived executors, ` +
      `${contracts.length} other contracts, ${Object.keys(owners).length} rolled up`,
  );
  return owners;
}

/** Every executor address in the map — the wallets that must also be scored. */
export function executorsOf(owners: OwnerMap): string[] {
  return Object.keys(owners);
}
