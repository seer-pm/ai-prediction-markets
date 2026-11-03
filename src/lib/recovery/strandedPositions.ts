import { TradeExecutorAbi } from "@/abis/TradeExecutorAbi";
import { config } from "@/config/wagmi";
import { readContractsInBatch } from "@/lib/on-chain/readContractsInBatch";
import { noteSentBlock, toastifyTx, waitForSentBlock } from "@/lib/toastify";
import { CHAIN_ID, CONDITIONAL_TOKENS } from "@/utils/constants";
import { estimateGas, readContract, sendTransaction } from "@wagmi/core";
import {
  Address,
  bytesToHex,
  concat,
  encodeFunctionData,
  erc20Abi,
  Hex,
  parseAbi,
  stringToBytes,
} from "viem";

/**
 * Recovering outcome tokens that sit in the user's own wallet instead of their trade wallet.
 *
 * Until 2026-11-03 a "Withdraw tokens" button moved every outcome token of a contest from the trade
 * wallet to the owner's wallet — 294 of them on originality round 3. Sell all and Redeem act on
 * the trade wallet only, so those positions became unreachable from the app. Sending them back
 * one `transfer` each costs a wallet confirmation per token (or one per 10 on a batching wallet).
 *
 * Instead, every Seer outcome token is a `Wrapped1155` over a ConditionalTokens position, and the
 * factory can unwrap any number of them in one call — burning from the caller needs no approval:
 *
 *   1. unwrap:  factory.batchUnwrap(...)            wrapped ERC20s → raw positions, owner wallet
 *   2. approve: ConditionalTokens.setApprovalForAll(tradeWallet, true)
 *   3. rewrap:  tradeWallet.batchExecute([CT.safeBatchTransferFrom(owner → factory)])
 *               the factory wraps on receipt and mints to its *operator* — the trade wallet
 *   4. revoke:  ConditionalTokens.setApprovalForAll(tradeWallet, false)
 *
 * The trade wallet has no ERC-1155 receiver hook, so the raw positions cannot be sent to it
 * directly; step 3 is the way round that. Measured against a real stranded wallet (255 tokens,
 * 2026-11-03): unwrap ~53k gas a token, rewrap ~41k — all 255 fit in one transaction each, so the
 * whole recovery was four transactions.
 *
 * Each step is chosen from chain state read just before it, never from what the page last showed,
 * so a stopped run resumes where it left off and no transaction is sized from a stale balance.
 */

/** The 1155-to-20 factory every Seer outcome token on Optimism was created by. */
export const WRAPPED1155_FACTORY: Address = "0xD194319D1804C1051DD21Ba1Dc931cA72410B79f";

/** Optimism caps a transaction at 2^24 gas; chunks are kept under this, with room to spare. */
export const MAX_CHUNK_GAS = 14_000_000n;

const wrappedAbi = parseAbi([
  "function factory() view returns (address)",
  "function multiToken() view returns (address)",
  "function tokenId() view returns (uint256)",
]);
const factoryAbi = parseAbi([
  "function getWrapped1155(address multiToken, uint256 tokenId, bytes data) view returns (address)",
  "function batchUnwrap(address multiToken, uint256[] tokenIds, uint256[] amounts, address recipient, bytes data)",
]);
const conditionalTokensAbi = parseAbi([
  "function balanceOfBatch(address[] owners, uint256[] ids) view returns (uint256[])",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] values, bytes data)",
]);

const conditionalTokens = (): Address => CONDITIONAL_TOKENS[CHAIN_ID];

/**
 * `MarketFactory.toString31`: the string left-aligned in a word, its byte length times two in the
 * last byte — the layout Solidity uses for a short string in storage.
 */
export function toString31(value: string): Hex {
  const bytes = stringToBytes(value);
  if (bytes.length >= 32) throw new Error(`"${value}" is too long to encode`);
  const word = new Uint8Array(32);
  word.set(bytes);
  word[31] = bytes.length * 2;
  return bytesToHex(word);
}

/**
 * The 65 bytes a Seer outcome token was wrapped with: name, symbol (Seer uses the token name for
 * both) and 18 decimals. The factory derives the token's address from it, so it is checked against
 * the real address before use — see `readPositions`.
 */
export const wrapData = (name: string): Hex => concat([toString31(name), toString31(name), "0x12"]);

export interface StrandablePosition {
  token: Address;
  tokenId: bigint;
  data: Hex;
}

/** Reads per multicall: these are cheap views, and a contest has a few hundred tokens. */
const READS_PER_BATCH = 200;

/**
 * The positions `owner` holds outside the trade wallet among `tokens`, wrapped or already
 * unwrapped, each with the data that wraps it back into the same token.
 *
 * Unwrapped positions count too: a run that stopped after its unwrap leaves the wrapped balance at
 * zero and the position raw in the owner's wallet, and it must still be found to be finished.
 *
 * A held token is left out — and returned in `unrecoverable` — unless it was made by the Seer
 * factory over ConditionalTokens and the rebuilt data maps back to its exact address.
 */
export async function readPositions(owner: Address, tokens: Address[]) {
  const unique = [...new Map(tokens.map((token) => [token.toLowerCase(), token])).values()];
  if (!unique.length) return { positions: [] as StrandablePosition[], unrecoverable: [] as Address[] };

  const reads: unknown[] = await readContractsInBatch(
    unique.flatMap((address) => [
      { address, abi: wrappedAbi, functionName: "tokenId", chainId: CHAIN_ID },
      { address, abi: erc20Abi, functionName: "balanceOf", args: [owner], chainId: CHAIN_ID },
    ]),
    CHAIN_ID,
    READS_PER_BATCH,
    true,
  );
  const tokenIds = unique.map((_, i) => reads[i * 2] as bigint);
  const wrapped = unique.map((_, i) => reads[i * 2 + 1] as bigint);
  const raw = await readContract(config, {
    address: conditionalTokens(),
    abi: conditionalTokensAbi,
    functionName: "balanceOfBatch",
    args: [unique.map(() => owner), tokenIds],
    chainId: CHAIN_ID,
  });

  const held = unique.flatMap((token, i) =>
    wrapped[i] > 0n || raw[i] > 0n ? [{ token, tokenId: tokenIds[i] }] : [],
  );
  if (!held.length) return { positions: [] as StrandablePosition[], unrecoverable: [] as Address[] };

  const meta: unknown[] = await readContractsInBatch(
    held.flatMap(({ token: address }) => [
      { address, abi: wrappedAbi, functionName: "factory", chainId: CHAIN_ID },
      { address, abi: wrappedAbi, functionName: "multiToken", chainId: CHAIN_ID },
      { address, abi: erc20Abi, functionName: "symbol", chainId: CHAIN_ID },
    ]),
    CHAIN_ID,
    READS_PER_BATCH,
    true,
  );

  const candidates: StrandablePosition[] = [];
  const unrecoverable: Address[] = [];
  held.forEach(({ token, tokenId }, i) => {
    const [factory, multiToken, symbol] = meta.slice(i * 3, i * 3 + 3) as [Address, Address, string];
    if (
      factory.toLowerCase() !== WRAPPED1155_FACTORY.toLowerCase() ||
      multiToken.toLowerCase() !== conditionalTokens().toLowerCase()
    ) {
      unrecoverable.push(token);
      return;
    }
    try {
      candidates.push({ token, tokenId, data: wrapData(symbol) });
    } catch {
      unrecoverable.push(token);
    }
  });

  const derived: Address[] = await readContractsInBatch(
    candidates.map(({ tokenId, data }) => ({
      address: WRAPPED1155_FACTORY,
      abi: factoryAbi,
      functionName: "getWrapped1155",
      args: [conditionalTokens(), tokenId, data],
      chainId: CHAIN_ID,
    })),
    CHAIN_ID,
    READS_PER_BATCH,
    true,
  );

  const positions = candidates.filter((position, i) => {
    const ok = derived[i].toLowerCase() === position.token.toLowerCase();
    if (!ok) unrecoverable.push(position.token);
    return ok;
  });
  return { positions, unrecoverable };
}

export interface RecoveryState {
  /** Wrapped outcome tokens in the owner's wallet, per position. */
  wrapped: bigint[];
  /** Raw ConditionalTokens positions in the owner's wallet — what an unwrap leaves. */
  raw: bigint[];
  /** Whether the trade wallet may move the owner's ConditionalTokens positions. */
  approved: boolean;
}

export async function readRecoveryState(
  owner: Address,
  tradeWallet: Address,
  positions: StrandablePosition[],
): Promise<RecoveryState> {
  const [wrapped, raw, approved] = await Promise.all([
    positions.length
      ? (readContractsInBatch(
          positions.map(({ token }) => ({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
            chainId: CHAIN_ID,
          })),
          CHAIN_ID,
          READS_PER_BATCH,
          true,
        ) as Promise<bigint[]>)
      : Promise.resolve([] as bigint[]),
    positions.length
      ? readContract(config, {
          address: conditionalTokens(),
          abi: conditionalTokensAbi,
          functionName: "balanceOfBatch",
          args: [positions.map(() => owner), positions.map(({ tokenId }) => tokenId)],
          chainId: CHAIN_ID,
        }).then((balances) => [...balances])
      : Promise.resolve([] as bigint[]),
    readContract(config, {
      address: conditionalTokens(),
      abi: conditionalTokensAbi,
      functionName: "isApprovedForAll",
      args: [owner, tradeWallet],
      chainId: CHAIN_ID,
    }),
  ]);
  return { wrapped, raw, approved };
}

export type RecoveryStep = "unwrap" | "approve" | "rewrap" | "revoke" | "done";

/**
 * What to do next, from chain state alone. Wrapped tokens are unwrapped first; raw positions then
 * go to the trade wallet, which needs the approval; the approval is taken back once nothing is
 * left to move. Raw positions the owner already held are moved as well — they are the owner's,
 * going to the owner's own trade wallet, and Sell all can use them there.
 */
export function nextStep({ wrapped, raw, approved }: RecoveryState): RecoveryStep {
  if (wrapped.some((amount) => amount > 0n)) return "unwrap";
  if (raw.some((amount) => amount > 0n)) return approved ? "rewrap" : "approve";
  if (approved) return "revoke";
  return "done";
}

export const STEP_LABELS: Record<Exclude<RecoveryStep, "done">, string> = {
  unwrap: "Unwrap your positions",
  approve: "Let your trade wallet take them",
  rewrap: "Move them into your trade wallet",
  revoke: "Take that permission back",
};

type Item = StrandablePosition & { amount: bigint };

/**
 * The longest prefix of `items` whose transaction estimates under `MAX_CHUNK_GAS`, halving from the
 * whole list. A failed estimate is treated as too big too: it is what an over-cap call looks like.
 */
export async function largestChunk(
  items: Item[],
  estimate: (chunk: Item[]) => Promise<bigint>,
): Promise<Item[]> {
  let size = items.length;
  let lastError: unknown;
  while (size > 0) {
    const chunk = items.slice(0, size);
    try {
      if ((await estimate(chunk)) <= MAX_CHUNK_GAS) return chunk;
    } catch (error) {
      lastError = error;
    }
    size = Math.floor(size / 2);
  }
  throw lastError ?? new Error("Could not size a transaction for these positions.");
}

const unwrapCall = (owner: Address, chunk: Item[]) => ({
  to: WRAPPED1155_FACTORY,
  data: encodeFunctionData({
    abi: factoryAbi,
    functionName: "batchUnwrap",
    args: [
      conditionalTokens(),
      chunk.map(({ tokenId }) => tokenId),
      chunk.map(({ amount }) => amount),
      owner,
      concat(chunk.map(({ data }) => data)),
    ],
  }),
});

const rewrapCall = (owner: Address, tradeWallet: Address, chunk: Item[]) => ({
  to: tradeWallet,
  data: encodeFunctionData({
    abi: TradeExecutorAbi,
    functionName: "batchExecute",
    args: [
      [
        {
          to: conditionalTokens(),
          data: encodeFunctionData({
            abi: conditionalTokensAbi,
            functionName: "safeBatchTransferFrom",
            args: [
              owner,
              WRAPPED1155_FACTORY,
              chunk.map(({ tokenId }) => tokenId),
              chunk.map(({ amount }) => amount),
              concat(chunk.map(({ data }) => data)),
            ],
          }),
        },
      ],
    ],
  }),
});

const approvalCall = (tradeWallet: Address, approved: boolean) => ({
  to: conditionalTokens(),
  data: encodeFunctionData({
    abi: conditionalTokensAbi,
    functionName: "setApprovalForAll",
    args: [tradeWallet, approved],
  }),
});

export interface RecoveryProgress {
  step: RecoveryStep;
  /** How many positions this transaction covers, for the unwrap and rewrap steps. */
  count?: number;
}

/**
 * Runs the recovery to the end, one transaction per iteration, re-reading chain state before each.
 * Every transaction is the owner's own, signed in their wallet: the trade wallet's `batchExecute`
 * accepts its owner, so no session key is involved.
 */
export async function recoverPositions({
  owner,
  tradeWallet,
  positions,
  onProgress,
}: {
  owner: Address;
  tradeWallet: Address;
  positions: StrandablePosition[];
  onProgress: (progress: RecoveryProgress) => void;
}) {
  // Each iteration either finishes or shrinks what is left; this only guards against a node that
  // keeps answering with state from before the last transaction.
  for (let iteration = 0; iteration < 40; iteration++) {
    await waitForSentBlock();
    const state = await readRecoveryState(owner, tradeWallet, positions);
    const step = nextStep(state);
    if (step === "done") {
      onProgress({ step });
      return;
    }

    let call: { to: Address; data: Hex };
    let count: number | undefined;
    if (step === "unwrap" || step === "rewrap") {
      const amounts = step === "unwrap" ? state.wrapped : state.raw;
      const items = positions
        .map((position, i) => ({ ...position, amount: amounts[i] }))
        .filter(({ amount }) => amount > 0n);
      const build = (chunk: Item[]) =>
        step === "unwrap" ? unwrapCall(owner, chunk) : rewrapCall(owner, tradeWallet, chunk);
      const chunk = await largestChunk(items, (candidate) =>
        estimateGas(config, { account: owner, chainId: CHAIN_ID, ...build(candidate) }),
      );
      call = build(chunk);
      count = chunk.length;
    } else {
      call = approvalCall(tradeWallet, step === "approve");
    }

    onProgress({ step, count });
    const result = await toastifyTx(
      () => sendTransaction(config, { to: call.to, data: call.data, chainId: CHAIN_ID }),
      { txSent: { title: STEP_LABELS[step] }, txSuccess: { title: `${STEP_LABELS[step]}: done` } },
    );
    if (!result.status) throw result.error;
    noteSentBlock(result.receipt);
  }
  throw new Error("The recovery did not finish. Reload the page to see where it stands, then continue.");
}
