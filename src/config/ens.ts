import pLimit from "p-limit";
import { createPublicClient, fallback, http, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { MAINNET_RPC } from "./rpc";

/**
 * ENS lives on Ethereum mainnet, and this app is Optimism-only. Reverse resolution is a plain
 * read-only `eth_call` against the mainnet UniversalResolver — no wallet, no signature, no chain
 * switch — so a standalone public client is all it takes. Mainnet is deliberately *not* added to
 * the wagmi/AppKit networks in `./wagmi`, which would offer it as a switchable network in the
 * connect modal.
 */
export const ensClient = createPublicClient({
  chain: mainnet,
  // Note the absence of `batch: { multicall }`, unlike the Optimism adapter in `./wagmi`. With
  // multicall batching on, viem routes the read through `scheduleMulticall`, and its CCIP-Read
  // recovery only fires on a *top-level* revert — so any reverse record served by an offchain
  // (wildcard / CCIP-Read) resolver would silently resolve to no name. One call per address keeps
  // each OffchainLookup revert visible to viem. Concurrency is bounded by `limit` below instead.
  transport: fallback([http(MAINNET_RPC), http("https://eth.llamarpc.com")]),
});

/** Shared by every caller, so a full page of rows resolves a few at a time rather than all at once. */
const limit = pLimit(6);

/**
 * The primary ENS name for `address`, or null when it has none.
 *
 * The UniversalResolver's `reverse` already forward-verifies on-chain that the name resolves back
 * to this address, so the only extra check we need is a cosmetic one: a name that doesn't survive
 * ENS normalization unchanged is a homoglyph (e.g. `vitalik.eth` spelled with a Cyrillic `а`), and
 * this label sits in a money table that links out to a block explorer. Show the hex instead.
 */
export async function resolveEnsName(address: string): Promise<string | null> {
  if (!isAddress(address)) return null;

  const name = await limit(() => ensClient.getEnsName({ address }));
  if (!name) return null;

  try {
    return normalize(name) === name ? name : null;
  } catch {
    return null;
  }
}
