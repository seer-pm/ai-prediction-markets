/**
 * Per-participant P/L for Round 2 · L1, as CSV.
 *
 * `wallet,input,output,pnl,redeemable,netPnl` — all amounts in sUSDS.
 *
 *   input      sUSDS put in: minting a complete set (parent `PositionSplit`) plus buying
 *              outcome tokens on the pools
 *   output     sUSDS taken back out: merging or redeeming (parent `PositionsMerge` +
 *              `PayoutRedemption`) plus selling outcome tokens on the pools
 *   pnl        output − input, i.e. realised
 *   redeemable settlement value of everything the participant still holds
 *   netPnl     pnl + redeemable — the bottom line once open positions are redeemed
 *
 * L1 is a parent market plus one nested "Other repositories" child. The shared machinery lives in
 * `lib/pnlExport.ts`; what stays here is L1's own shape — its two market ids, where its collateral
 * gate sits, and the sUSDS pool legs, which no other contest here has.
 *
 *   npm run export:l1-pnl [-- <output.csv>]
 */
import {
  POSITION_SPLIT,
  POSITIONS_MERGE,
  PAYOUT_REDEMPTION,
  ZERO_BYTES32,
  addDerivedExecutors,
  addPoolLegs,
  buildReport,
  client,
  createRowStore,
  CTF,
  fetchMarkets,
  findPools,
  mapHoldersToParticipants,
  printTop,
  readHeldValue,
  resolveTxInfo,
  run,
  settlementValues,
  snapshotBlock,
  sumOf,
  warnDoubleClaims,
  writeReport,
} from "./lib/pnlExport";
import { L1_MARKET_ID, OTHER_MARKET_ID, collateral } from "@/utils/constants";
import { formatUnits, type Address, type Hex } from "viem";

async function main() {
  const outPath = process.argv[2] ?? "scripts/out/l1-participants.csv";
  const toBlock = await snapshotBlock();

  // ── markets ────────────────────────────────────────────────────────────────────────────────
  const [parent, other] = await fetchMarkets([L1_MARKET_ID, OTHER_MARKET_ID]);

  if (!parent.payoutReported || !other.payoutReported) {
    console.warn("warning: a market has not reported payouts — `redeemable` will read 0 for it");
  }

  const parentTokens = parent.wrappedTokens.map((token) => token.toLowerCase());
  const childTokens = other.wrappedTokens.map((token) => token.toLowerCase());
  const parentOutcome = Number(other.parentOutcome);

  const { valueByToken, parentRatios } = await settlementValues(parent, [other]);
  const carrierRatio = parentRatios[parentOutcome] ?? 0;

  console.log(
    `parent ${parent.id} (${parentTokens.length} outcomes) · child ${other.id} (${childTokens.length} outcomes) ` +
      `under outcome ${parentOutcome} "${parent.outcomes[parentOutcome]}" @ ${carrierRatio.toFixed(6)}`,
  );

  // ── conditional-token flows ────────────────────────────────────────────────────────────────
  const isOurs = (log: { args: { conditionId?: Hex } }) =>
    log.args.conditionId === parent.conditionId || log.args.conditionId === other.conditionId;
  /** Only the root level moves sUSDS; a child split/merge/redeem moves the carrier token. */
  const isCollateralGate = (log: { args: { conditionId?: Hex; parentCollectionId?: Hex } }) =>
    log.args.conditionId === parent.conditionId && log.args.parentCollectionId === ZERO_BYTES32;

  const [splits, merges, redemptions] = await Promise.all([
    client.getLogs({ address: CTF, event: POSITION_SPLIT, fromBlock: 0n, toBlock }),
    client.getLogs({ address: CTF, event: POSITIONS_MERGE, fromBlock: 0n, toBlock }),
    client.getLogs({
      address: CTF,
      event: PAYOUT_REDEMPTION,
      args: { collateralToken: collateral.address as Address },
      fromBlock: 0n,
      toBlock,
    }),
  ]);

  const events = [
    ...splits.filter(isOurs).map((log) => ({ log, kind: "split" as const, amount: log.args.amount! })),
    ...merges.filter(isOurs).map((log) => ({ log, kind: "merge" as const, amount: log.args.amount! })),
    ...redemptions
      .filter(isOurs)
      .map((log) => ({ log, kind: "redeem" as const, amount: log.args.payout! })),
  ];

  const countOf = (kind: string) => events.filter((event) => event.kind === kind).length;
  console.log(
    `events: ${countOf("split")} splits, ${countOf("merge")} merges, ${countOf("redeem")} redemptions`,
  );

  // ── holders ────────────────────────────────────────────────────────────────────────────────
  const ourTokens = new Set([...parentTokens, ...childTokens]);
  const hashes = [...new Set(events.map((event) => event.log.transactionHash!))];
  const txInfo = await resolveTxInfo(hashes, ourTokens);
  const participantOf = await mapHoldersToParticipants(txInfo);

  // ── aggregate ──────────────────────────────────────────────────────────────────────────────
  const { rows, rowFor } = createRowStore();

  let unattributed = 0n;
  for (const event of events) {
    const info = txInfo.get(event.log.transactionHash!.toLowerCase());
    const holder = info?.holder || info?.to || info?.from;
    if (!holder) {
      unattributed += event.amount;
      continue;
    }
    const participant = participantOf.get(holder) ?? holder;
    const row = rowFor(participant);
    row.wallets.add(holder);
    if (!isCollateralGate(event.log)) continue;
    if (event.kind === "split") row.split += event.amount;
    else row.mergedAndRedeemed += event.amount;
  }

  await addDerivedExecutors(rows);

  // ── open positions ─────────────────────────────────────────────────────────────────────────
  const allWallets = [...new Set([...rows.values()].flatMap((row) => [...row.wallets]))];
  const tokens = [...parentTokens, ...childTokens];
  const heldValue = await readHeldValue(allWallets, tokens, valueByToken, toBlock);

  // ── pool legs ──────────────────────────────────────────────────────────────────────────────
  // L1 is the one contest here whose pools pay in sUSDS. The trade strategy does not only mint: it
  // sells the outcomes priced above the prediction and buys the ones priced below
  // (`useExecuteTradeStrategy`), and that sUSDS never crosses the collateral gate. Left out, a
  // wallet that bought complete sets on the pools and merged them reads as pure profit and its
  // counterparty as pure loss. So sUSDS a participant puts into the pools joins `input` and sUSDS
  // the pools pay back joins `output`. See `addPoolLegs` for how a payment is attributed.
  const pools = new Set(
    (await findPools([parent, other], toBlock, { required: true })).map((pool) => pool.id),
  );
  const { unmatchedIn, unmatchedOut } = await addPoolLegs(rows, { pools, tokens, toBlock });

  warnDoubleClaims(rows);

  // ── csv ────────────────────────────────────────────────────────────────────────────────────
  const report = buildReport(rows, heldValue);
  writeReport(outPath, report);

  // Two closures, both of which must hold. The gate: every sUSDS minted is merged, redeemed or
  // still redeemable, so what is left over is what leaked to addresses that never minted. The
  // pools: they started empty and are empty again, so what went in has come back out.
  console.log(
    `gate closes to ${(
      sumOf(report, (row) => row.minted) -
      sumOf(report, (row) => row.returned) -
      sumOf(report, (row) => row.redeemable)
    ).toFixed(2)} · pools close to ${(
      sumOf(report, (row) => row.paidToPools) +
      unmatchedIn -
      sumOf(report, (row) => row.tookFromPools) -
      unmatchedOut
    ).toFixed(2)} (${unmatchedIn.toFixed(2)} in / ${unmatchedOut.toFixed(2)} out belongs to ` +
      "addresses that never minted)",
  );
  if (unattributed > 0n) {
    console.log(
      `unattributed flow: ${Number(formatUnits(unattributed, collateral.decimals)).toFixed(2)}`,
    );
  }

  printTop(report);
}

run(main);
