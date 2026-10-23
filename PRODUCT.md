# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served equally (decided 2026-10-23):

- **The askers**: the programs a contest prices for. Deep Funding first (the Originality, L1 and L2
  rounds over Ethereum repositories), plus Octant and the Zcash community (grants and the NU7 ballot)
  in archived contests. They want to read what the market currently expects, per repository, project
  or proposal, without first becoming traders.
- **Traders**, people and teams running models (including AI agents), who supply that information.
  The usual path: upload a CSV of predictions, see it beside the market price, and execute one run
  that trades every market where they disagree.

## Product Purpose

Deep runs contests of markets with many outcomes at once: 98 repositories in Round 3, dozens of
projects or proposals in the others. Each market's price is the crowd's running estimate of how the
question will resolve.

In the Deep Funding rounds the market predicts the jury: the jury's evaluation resolves the markets
and sets the funding weights, so the price is a forecast of that evaluation before it happens.

Success: an asker can see, for a whole field of repositories, what the market expects the outcome to
be and how confident and liquid it is; a trader can load their predictions, see where they disagree
with the market, and act on all of it in one run.

## Positioning

Deep is one application of the Seer protocol (see `seerApps` in `@seer-pm/ui-kit`) and the one built
for questions with very many outcomes priced together. Its distinct mechanism is portfolio trading:
a trade wallet executes hundreds of trades in a single run against a submitted set of predictions,
instead of one market at a time. Single-market trading, liquidity provision and full analytics live
in the Seer app, and Deep points there.

## Operating Context

- Optimism only. Collateral is sUSDS, which earns Sky savings yield while held.
- Onboarding is three steps: connect a wallet, create a trade wallet (a contract the user owns), add
  sUSDS. Runs may use EIP-7702 and a temporary session key; gas top-ups are refunded.
- Predictions come in as CSV, one shape per contest (originality per repository, repository weights
  with parent ecosystem, dependency weights, project shares 0-100, proposal probabilities 0-1). They
  are diffed against the current market prices.
- Contest shapes:
  - Round 3 · Originality (live): each repository trades as a pair; UP is the share of original
    work, DOWN the share carried by dependencies.
  - Round 2 · Originality, L1 (repository weights) and L2 (dependency weights within a repository);
    Round 1. All ended.
  - Octant (each project's share of the round), Zcash · Grants (each proposal's chance of approval),
    Zcash · NU7 (ballot questions). All ended.
- Ended contests keep only redeem, withdraw and sell flows. A contest set built wrongly (the first
  Round 3 set) has its own withdraw page reached only by direct link and never named in the main UI.
- The leaderboard ranks wallets by profit/loss (realised and marked-to-market, in USD) per contest
  and across all of them, with volume, ROI and a submission score.

## Capabilities and Constraints

- Vite + React 19 SPA, Tailwind 4, Netlify with functions (leaderboard, profiles, chart series);
  contest registry in `src/utils/contests.ts`, which also feeds Seer's leaderboard via
  `npm run sync:seer`.
- `#root` is the scroll container, not the document, so dialogs and menus do not shift the page.
- Trading, quoting, redeem and sell-all logic is covered by vitest and must keep working through any
  redesign; tests select by role and text, so copy changes update their tests.

## Brand Commitments

- Electric Foundation through `@seer-pm/ui-kit` (tokens, Open Sans, lockup, footer, buttons, fields,
  dialog), the same as seer.pm and the Seer app. Shared values change in the kit, never here.
- Product name "Deep", shown with the Seer lockup; canonical URL deep.seer.pm. "AI Prediction
  Markets" is retired as the product name.
- Secured by Kleros.

## Evidence on Hand

- Live and archived contests from the registry, with prices, chart series, volume, liquidity,
  resolved weights and the leaderboard.
- Absent and not to be fabricated: prizes or rewards beyond market P/L (there are none), claims that
  a program allocated funds because of the market, participation or volume totals beyond what the
  data shows, testimonials.

## Product Principles

1. The answer before the trade: a contest page first says what is being priced, for whom, and what
   the market expects across the field; the trading tools follow.
2. Name the asker and the resolver: every contest says which program asks and what resolves it (in
   Deep Funding, the jury).
3. The field, not the line: with dozens of outcomes the reading is the ranking and its movement, and
   any single series is detail on demand.
4. Your view beside the market's: once predictions are loaded, the disagreement is the thing to act
   on, and a run trades exactly that.
5. Live data only, and finished contests say so plainly.
