---
version: 1
slug: "src-components-tabs-originalitymarkets-tsx"
primary_target: "src/components/tabs/OriginalityMarkets.tsx"
related_targets: ["src/components/OriginalityMarketTable.tsx","src/components/contest/ContestBrief.tsx"]
---

## Scope and mode

The contest view (Round 3 Originality, and the archived Round 2 on the same component). Mode: operate, read by two audiences.

## Audience, job, constraints

- The asker (Deep Funding) reads what the market expects across all repositories and who decides; no trading required.
- The trader loads a predictions CSV, sees each disagreement, and runs one batched trade from the trade wallet.
- Trading, quoting, redeem and sell-all behaviour is pinned by tests; the button set of the main view is pinned too.

## Chosen direction

Ranked field with split bars and prediction marks (surface seed 8d562a19, dealt structures 7, 2 and 1, fused): the question as the heading, one sentence of live answer, who asks and resolves, then every repository ranked by its UP price with UP and DOWN as one purple and gold bar and the prediction as a tick. The history chart follows as detail: muted context lines, up to four followed series in colour, followed from the field or the legend.

## Memorable moment

Loading a CSV draws a tick on every bar, so the disagreement with the market is visible across the whole field before any number is read.

## Open

- Archived contests (L1, L2, Octant, Zcash, NU7, Round 1) keep their old order; moving them onto ContestBrief and the field is the next step if they come back.
