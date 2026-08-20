# Ported P/L compute

This directory is a fork of Seer's `web/netlify/functions/utils/` (the `seer-pm/demo` repo).
It exists so the per-market leaderboard can compute profit and loss the same way
`app.seer.pm` does.

## Why fork instead of calling Seer's API

Seer exposes `get-portfolio-pl`, which computes market-scoped P/L live — but it is a
*synchronous* Netlify function, capped at 26 s. Measured against real deep-market wallets:

- a typical Round 2 · L2 wallet takes 13–20 s for only ~40 of that contest's 213 market ids,
  so a full answer needs six chained calls;
- the largest LP (`0xab07c8…`) returns 504 even with ten market ids. Run in-process it takes
  **145 s**.

Running the same code inside our own background function (`refresh-leaderboard-background.ts`,
~15 min budget) removes the cap. The numbers are identical — verified wallet-by-wallet against
the live endpoint.

## What was changed

Everything else is verbatim. Keep it that way: reformatting turns the next re-sync into a
manual merge.

| Change | Why |
|---|---|
| `transactions/fetchAccountDexEvents.ts` — CoW Protocol leg removed | Deep markets are Optimism-only and trade on Uniswap v3; upstream already short-circuits CoW where there is no order book host. Drops the `@cowprotocol/cow-sdk` and `@netlify/blobs` dependencies, and upstream's `transactions/cowswapSwaps.ts` is not ported at all. |
| `markets.ts` — `getSubgraphVerificationStatusList` stubbed to `{}` | Kleros curation has no bearing on P/L and Optimism has no registry. Avoids porting `curate.ts` (447 lines). |
| `markets.ts` — `FAST_TESTNET_FACTORY` inlined | Was the only thing needed from `web/src/lib/constants`. |
| `dexQueries.ts` — **new** | `fetchAccountDexEvents` calls `GetAccountDexEvents`, added to Seer's workspace `queries/swapr.graphql` in `a9aacfe7`. Published `@seer-pm/sdk@0.0.18` only generates the separate `GetSwaps` / `GetMints` / `GetBurns`. The document is copied verbatim and issued via `goldskyClient.getAccountDexEvents`, through the same pacing/retry wrapper. **Delete this file once the SDK catches up.** |
| `goldskyClient.ts` — `GraphQLClient` type taken from the SDK | Upstream imports the type from `graphql-request`, which we do not depend on directly (only transitively). `NonNullable<ReturnType<typeof swaprGraphQLClient>>` gives the same type with no phantom dependency. |
| `buildPortfolioPositions.ts` — `chainId` field and `repricePortfolioPositions` dropped | Both come from upstream's multichain portfolio work. `PortfolioPosition` in SDK 0.0.18 has no `chainId`, `repricePortfolioPositions` served portfolio endpoints this fork does not carry, and it was the only reader of the field. |
| `envioQueries.ts` — **new** | The published `@seer-pm/sdk@0.0.18` is behind Seer's workspace copy: it generates no `GetAccountActivity` / `GetTokenBalances` / `GetTokenBalanceDailies`, and its `Transfer` fragment omits `market` / `kind` / `involvesRouter`. These documents are copied from Seer's `queries/markets.graphql` and run through the same rate limiter via `seerEnvioRequest`. **Delete this file once the SDK catches up.** |
| `@/lib/chains` → `viem/chains`, `@/lib/utils` → `@/utils/common` | Those helpers already exist here. |
| `netPrimaryCollateralSwapFlow.ts` / `portfolioPlCompute.ts` — added `marketIdsByStartTime` / `tradedMarketIds` (carried onto the `…FromEvents` signature) | Additive: the ids behind `marketCount`, which upstream discards. The leaderboard merges a participant's wallets, and adding two counts double-counts a market both traded — it produced `marketCount: 2` inside a one-market contest. Nothing else reads the field. |

## Re-syncing

Last synced to `origin/main` @ `db390581` (2026-08-19). That sync brought in the one-pass DEX
fetch (`fetchAccountDexEvents` — swaps + mints + burns in a single GraphQL POST per page, behind
`goldskyClient`'s rate limiter, replacing three separately-paginated streams), on-chain current
outcome prices (`onchainOutcomePrices.ts` / `fetchPools.ts` / `outcomePrices.ts`, with
`dexPoolHourPrices.ts` now history-only), and the `if (dexEvents)` guard that makes a wallet with
zero Generic markets a legitimate zero row instead of a skipped upsert — which is the
trade-executor *owner* EOA case.

Upstream's `executorOwners.ts` (added `db390581`) converged independently on the same design as
ours — CREATE2 derivation, `owner()` confirmation, EIP-7702 (`0xef0100`) handling — differing only
in the blob key. No port needed; compare the two if either side changes.

Not ported: `pnlLeaderboardRollup.test.ts` (no test runner in this repo; the equivalent rollup
lives in `../leaderboard.ts`) and `transactions/cowswapSwaps.ts` (see the CoW row above).

Diff against `D:\Code\demo\web\netlify\functions\utils\` (or the `seer-pm/demo` repo) and
re-apply the table above. `portfolioPlCompute.ts` carries the authoritative description of the
formula and its documented limits in the doc comment above `computePortfolioPlAllPeriods` —
read it before changing anything here.
