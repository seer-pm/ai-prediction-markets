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
| `getSwapEvents.ts` — CoW Protocol leg removed | Deep markets are Optimism-only and trade on Uniswap v3; upstream already short-circuits CoW where there is no order book host. Drops the `@cowprotocol/cow-sdk` and `@netlify/blobs` dependencies. |
| `markets.ts` — `getSubgraphVerificationStatusList` stubbed to `{}` | Kleros curation has no bearing on P/L and Optimism has no registry. Avoids porting `curate.ts` (447 lines). |
| `markets.ts` — `FAST_TESTNET_FACTORY` inlined | Was the only thing needed from `web/src/lib/constants`. |
| `envioQueries.ts` — **new** | The published `@seer-pm/sdk@0.0.18` is behind Seer's workspace copy: it generates no `GetAccountActivity` / `GetTokenBalances` / `GetTokenBalanceDailies`, and its `Transfer` fragment omits `market` / `kind` / `involvesRouter`. These documents are copied from Seer's `queries/markets.graphql` and run through the same rate limiter via `seerEnvioRequest`. **Delete this file once the SDK catches up.** |
| `@/lib/chains` → `viem/chains`, `@/lib/utils` → `@/utils/common` | Those helpers already exist here. |
| `netPrimaryCollateralSwapFlow.ts` / `portfolioPlCompute.ts` — added `marketIdsByStartTime` / `tradedMarketIds` | Additive: the ids behind `marketCount`, which upstream discards. The leaderboard merges a participant's wallets, and adding two counts double-counts a market both traded — it produced `marketCount: 2` inside a one-market contest. Nothing else reads the field. |

## Re-syncing

Diff against `D:\Code\demo\web\netlify\functions\utils\` (or the `seer-pm/demo` repo) and
re-apply the table above. `portfolioPlCompute.ts` carries the authoritative description of the
formula and its documented limits in the doc comment above `computePortfolioPlAllPeriods` —
read it before changing anything here.
