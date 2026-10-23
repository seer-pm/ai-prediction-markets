# Deep

Contests of markets with many outcomes, priced together on Optimism: deep.seer.pm. Traders load a
CSV of predictions, see it beside the market price, and execute one run from a trade wallet that
trades every market where they disagree. What the product is for, and who it serves, is in
[PRODUCT.md](PRODUCT.md).

Vite + React 19 + Tailwind 4, deployed on Netlify with functions under `netlify/functions`.

## Develop

```bash
npm install
npm run dev
```

The app reads its data from the Netlify functions, so run `netlify dev` instead when you need them
locally.

Environment (`.env`):

| Variable | Used by |
| --- | --- |
| `VITE_WC_PROJECT_ID` | Reown AppKit (wallet connect) |
| `VITE_WEBSITE_URL` | Base URL for the app's own API calls; defaults to the production site |
| `SUPABASE_PROJECT_URL`, `SUPABASE_API_KEY` | Functions: market data, chart series, profiles, predictions |

The functions also read `PRIVATE_RPC_*`, `SEER_API_HOST` and `API_HOST` when set.

## Check

```bash
npm test                     # vitest
npm run lint
npm run build                # codegen, tsc -b, vite build
npm run typecheck:functions
```

## Contests

Every contest is one entry in `src/utils/contests.ts`; `src/components/Tab.tsx` maps it to its view.
After adding or editing a contest, run `npm run sync:seer` so Seer's leaderboard registry picks it up
(`--dry-run` shows the diff first).

## Scripts

`npm run export:l1-pnl`, `export:l2-pnl` and `rebuild:chart-series` are maintenance jobs in
`scripts/`; each explains what it does at the top of its file.
