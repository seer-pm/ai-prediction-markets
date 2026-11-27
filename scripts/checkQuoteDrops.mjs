// Build-time guard: trade code must not drop a failed quote without a word.
//
// On 2026-11-27 three of 55 Zcash Round 2 markets were left out of a run because their quotes
// failed and the code turned the failure into "no trade" (`Promise.allSettled` keeping only the
// fulfilled results, or `.catch(() => null)`). Round 3 had the same in four places. Both were fixed
// to retry and name what still fails (PRs #30, #31) through `src/lib/trade/settleWithRetry.ts`.
//
// New markets are usually built by copying an older contest, so this runs in `npm run build` (and
// so on every Netlify deploy preview) and fails when such a pattern appears in trade code outside
// `settleWithRetry.ts`, except in the functions listed below. Those belong to finished contests,
// are listed by name so a copy under a new name still fails, and are to be removed from the list,
// not added to, as they are fixed.
//
// Usage: node scripts/checkQuoteDrops.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/lib/trade", "src/hooks"];
const EXEMPT_FILES = new Set(["src/lib/trade/settleWithRetry.ts"]);

/** Finished contests, written before the rule. `file#function`: count of drops it may hold. */
const LEGACY = {
  "src/lib/trade/getQuote.ts#getL1SellQuotes": 1,
  "src/lib/trade/getQuote.ts#getL1BuyQuotes": 1,
  "src/lib/trade/getQuote.ts#getOctantSellQuotes": 1,
  "src/lib/trade/getQuote.ts#getOctantBuyQuotes": 1,
  "src/lib/trade/getQuote.ts#getSellAllOctantQuotes": 1,
  "src/lib/trade/getQuote.ts#getL2MarketSellQuotes": 1,
  "src/lib/trade/getQuote.ts#getL2MarketBuyQuotes": 1,
  "src/lib/trade/getQuote.ts#getSellAllL1Quotes": 1,
  "src/lib/trade/getQuote.ts#getSellAllL2Quotes": 1,
  "src/lib/trade/getZcashNu7Quote.ts#quoteLeg": 1,
  "src/lib/trade/getZcashNu7Quote.ts#getZcashNu7Quotes": 1,
  "src/hooks/useSellAllZcashNu7.ts#sellAllZcashNu7": 1,
};

const PATTERNS = [
  /Promise\.allSettled\(/g,
  /\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(null|undefined|\[\]|\{\s*\})\s*\)/g,
];

/** Every drop in `source`, with the top-level function or constant it sits in. */
export function findDrops(source) {
  const lines = source.split(/\r?\n/);
  const drops = [];
  let owner = "(top level)";
  lines.forEach((line, index) => {
    const declared = line.match(/^(?:export\s+)?(?:async\s+)?(?:const|let|function)\s+([A-Za-z0-9_$]+)/);
    if (declared) owner = declared[1];
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) drops.push({ owner, line: index + 1, text: line.trim() });
    }
  });
  return drops;
}

/**
 * Compare the drops found per file against the legacy list. Returns problems, empty when clean.
 * `stale` also reports legacy entries that no longer drop anything, so the list only shrinks.
 */
export function check(filesToSource, { stale = true } = {}) {
  const problems = [];
  const counts = {};
  for (const [file, source] of Object.entries(filesToSource)) {
    if (EXEMPT_FILES.has(file)) continue;
    for (const drop of findDrops(source)) {
      const key = `${file}#${drop.owner}`;
      counts[key] = (counts[key] ?? 0) + 1;
      if (counts[key] > (LEGACY[key] ?? 0)) {
        problems.push(
          `${file}:${drop.line} (${drop.owner}) drops failed quotes: ${drop.text}\n` +
            "  Use settleWithRetry (src/lib/trade/settleWithRetry.ts): retry, then return what still " +
            "failed and name it to the user (see SkippedMarketsNotice).",
        );
      }
    }
  }
  for (const [key, allowed] of Object.entries(LEGACY)) {
    if (stale && (counts[key] ?? 0) < allowed) {
      problems.push(`${key} no longer drops quotes: remove it from LEGACY in scripts/checkQuoteDrops.mjs.`);
    }
  }
  return problems;
}

/** The guard has to be able to fail, or it is not evidence of anything. */
function selfTest() {
  const bad = check({
    "src/lib/trade/getNewQuote.ts": "export const getNewQuotes = async () => {\n  const r = await Promise.allSettled(x);\n};",
    "src/hooks/useNew.ts": "const quoteLeg = () => getUniswapQuote(a).catch(() => null);",
    "src/lib/trade/getQuote.ts": "export const getL1SellQuotes = async () => {\n  await Promise.allSettled(a);\n  await Promise.allSettled(b);\n};",
  }, { stale: false });
  const clean = check({
    "src/lib/trade/getNewQuote.ts": "export const getNewQuotes = async () => settleWithRetry(rows, quote);",
  }, { stale: false });
  if (bad.length !== 3 || clean.length !== 0) {
    throw new Error(`checkQuoteDrops self-test failed: ${bad.length} of 3 caught, ${clean.length} false alarms`);
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  selfTest();
  const files = Object.fromEntries(
    ROOTS.flatMap(walk).map((path) => [relative(process.cwd(), path).replace(/\\/g, "/"), readFileSync(path, "utf8")]),
  );
  const problems = check(files);
  if (problems.length) {
    console.error(`checkQuoteDrops: ${problems.length} problem(s)\n\n${problems.join("\n\n")}`);
    process.exit(1);
  }
  console.log(`checkQuoteDrops: ${Object.keys(files).length} files clean (${Object.keys(LEGACY).length} legacy functions exempt).`);
}
