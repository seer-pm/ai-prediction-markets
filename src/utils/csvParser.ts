import { L2Row, OctantRow, OriginalityRow, PredictionRow, ZcashNu7Row, ZcashRow } from "@/types";
import { getZcashMarketByTitle } from "@/utils/zcashMarkets";
import { ZCASH_NU7_MARKETS } from "@/utils/zcashNu7Markets";
import { NU7_SUM_TOLERANCE } from "@/utils/zcashNu7Targets";

export const parseCSV = (csvText: string): PredictionRow[] => {
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row");
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  // Check for required columns
  if (headers.length !== 3) {
    throw new Error("CSV must have exactly 3 columns: repo, parent, weight");
  }

  if (!headers.includes("repo") || !headers.includes("parent") || !headers.includes("weight")) {
    throw new Error("CSV must have columns: repo, parent, weight");
  }

  const seenRepos = new Set<string>();
  const results: PredictionRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(",").map((v) => v.trim());

    if (values.length !== 3) {
      throw new Error(`Row ${i + 1}: Expected 3 columns, found ${values.length}`);
    }

    const repo = values[0];
    const parent = values[1];
    const weightStr = values[2];

    // Check for empty values
    if (!repo || !parent || !weightStr) {
      throw new Error(`Row ${i + 1}: All columns must have values`);
    }

    // Check for duplicate repo
    if (seenRepos.has(repo)) {
      throw new Error(`Row ${i + 1}: Duplicate repository "${repo}"`);
    }
    seenRepos.add(repo);

    // Validate weight
    const weight = parseFloat(weightStr);
    if (isNaN(weight)) {
      throw new Error(`Row ${i + 1}: Weight "${weightStr}" is not a valid number`);
    }

    if (weight < 0) {
      throw new Error(`Row ${i + 1}: Weight cannot be negative`);
    }

    results.push({
      repo,
      parent,
      weight,
    });
  }

  if (results.length === 0) {
    throw new Error("CSV contains no valid data rows");
  }

  return results;
};

export const parseOriginalityCSV = (csvText: string): OriginalityRow[] => {
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row");
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  // Check for required columns
  if (headers.length !== 2) {
    throw new Error("CSV must have exactly 2 columns: repo, originality");
  }

  if (!headers.includes("repo") || !headers.includes("originality")) {
    throw new Error("CSV must have columns: repo, originality");
  }

  const seenRepos = new Set<string>();
  const results: OriginalityRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(",").map((v) => v.trim());

    if (values.length !== 2) {
      throw new Error(`Row ${i + 1}: Expected 2 columns, found ${values.length}`);
    }

    const repo = values[0];
    const originalityStr = values[1];

    // Check for empty values
    if (!repo || !originalityStr) {
      throw new Error(`Row ${i + 1}: All columns must have values`);
    }

    // Check for duplicate repo
    if (seenRepos.has(repo)) {
      throw new Error(`Row ${i + 1}: Duplicate repository "${repo}"`);
    }
    seenRepos.add(repo);

    // Validate originality
    const originality = parseFloat(originalityStr);
    if (isNaN(originality)) {
      throw new Error(`Row ${i + 1}: Originality "${originalityStr}" is not a valid number`);
    }

    if (originality < 0 || originality > 1) {
      throw new Error(`Row ${i + 1}: Originality must be between 0 and 1`);
    }

    results.push({
      repo,
      originality,
    });
  }

  if (results.length === 0) {
    throw new Error("CSV contains no valid data rows");
  }

  return results;
};

export const parseOctantCSV = (csvText: string): OctantRow[] => {
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row");
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  // Check for required columns
  if (headers.length !== 2) {
    throw new Error("CSV must have exactly 2 columns: project, percent");
  }

  if (!headers.includes("project") || !headers.includes("percent")) {
    throw new Error("CSV must have columns: project, percent");
  }

  const seenProjects = new Set<string>();
  const results: OctantRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(",").map((v) => v.trim());

    if (values.length !== 2) {
      throw new Error(`Row ${i + 1}: Expected 2 columns, found ${values.length}`);
    }

    const project = values[0];
    const percentStr = values[1];

    // Check for empty values
    if (!project || !percentStr) {
      throw new Error(`Row ${i + 1}: All columns must have values`);
    }

    // Check for duplicate project
    if (seenProjects.has(project)) {
      throw new Error(`Row ${i + 1}: Duplicate project "${project}"`);
    }
    seenProjects.add(project);

    // Validate percent (0-100 in the CSV; stored internally as a 0-1 fraction)
    const percent = parseFloat(percentStr);
    if (isNaN(percent)) {
      throw new Error(`Row ${i + 1}: Percent "${percentStr}" is not a valid number`);
    }

    if (percent < 0) {
      throw new Error(`Row ${i + 1}: Percent cannot be negative`);
    }

    results.push({
      project,
      weight: percent / 100,
    });
  }

  if (results.length === 0) {
    throw new Error("CSV contains no valid data rows");
  }

  return results;
};

export const parseL2CSV = (csvText: string): L2Row[] => {
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row");
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  // Check for required columns
  if (headers.length !== 3) {
    throw new Error("CSV must have exactly 3 columns: dependency, repo, weight");
  }

  if (!headers.includes("dependency") || !headers.includes("repo") || !headers.includes("weight")) {
    throw new Error("CSV must have columns: dependency, repo, weight");
  }

  const seenDependenciesByRepos = new Set<string>();
  const results: L2Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(",").map((v) => v.trim());

    if (values.length !== 3) {
      throw new Error(`Row ${i + 1}: Expected 3 columns, found ${values.length}`);
    }
    const [dependency, repo, weightStr] = values;

    // Check for empty values
    if (!dependency || !repo || !weightStr) {
      throw new Error(`Row ${i + 1}: All columns must have values`);
    }

    // Check for duplicate dependency + repo
    const dependencyByRepo = `${dependency}-${repo}`;
    if (seenDependenciesByRepos.has(dependencyByRepo)) {
      throw new Error(`Row ${i + 1}: Duplicate dependency "${dependency}" of repo "${repo}"`);
    }
    seenDependenciesByRepos.add(dependencyByRepo);

    // Validate weight
    const weight = parseFloat(weightStr);
    if (isNaN(weight)) {
      throw new Error(`Row ${i + 1}: Weight "${weightStr}" is not a valid number`);
    }

    if (weight < 0) {
      throw new Error(`Row ${i + 1}: Weight cannot be negative`);
    }

    results.push({
      dependency,
      repo,
      weight,
    });
  }

  if (results.length === 0) {
    throw new Error("CSV contains no valid data rows");
  }

  return results;
};

/**
 * The yes/no spellings this file used to accept. Kept only to recognise a stale file and say so
 * plainly, rather than failing it with "not a valid number".
 */
const LEGACY_YES_NO_VALUES = new Set([
  "yes",
  "y",
  "true",
  "approve",
  "approved",
  "no",
  "n",
  "false",
  "reject",
  "rejected",
]);

/**
 * Zcash predictions: one row per proposal, and how likely you think coinholders are to approve it.
 *
 * A probability in [0, 1] rather than a yes/no call — the number *is* the price each pool is aimed
 * at, so 0.82 says "82% likely" and lands the YES pool there. Rows may be left out entirely: a
 * proposal with no row gets no prediction and is never traded, which is how you say "no view"
 * without inventing a number. The project name is validated against the ballot (`ZCASH_MARKETS`)
 * rather than being matched loosely later — a typo here would otherwise surface as a silently
 * untraded row.
 */
export const parseZcashCSV = (csvText: string): ZcashRow[] => {
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row");
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  if (headers.length !== 2) {
    throw new Error("CSV must have exactly 2 columns: project, probability");
  }

  if (!headers.includes("project") || !headers.includes("probability")) {
    throw new Error("CSV must have columns: project, probability");
  }

  const seenProjects = new Set<string>();
  const results: ZcashRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(",").map((v) => v.trim());

    if (values.length !== 2) {
      throw new Error(`Row ${i + 1}: Expected 2 columns, found ${values.length}`);
    }

    const project = values[0];
    const probabilityStr = values[1];

    if (!project || !probabilityStr) {
      throw new Error(`Row ${i + 1}: All columns must have values`);
    }

    const market = getZcashMarketByTitle(project);
    if (!market) {
      throw new Error(
        `Row ${i + 1}: "${project}" is not a proposal in the Q3 2026 ballot. Download the sample CSV for the exact titles.`,
      );
    }

    // Key on the canonical title so casing and stray whitespace in the file cannot split one
    // proposal across two rows.
    if (seenProjects.has(market.title)) {
      throw new Error(`Row ${i + 1}: Duplicate project "${project}"`);
    }
    seenProjects.add(market.title);

    // A file from the old format would otherwise fail as "not a valid number", which says nothing
    // about what changed.
    if (LEGACY_YES_NO_VALUES.has(probabilityStr.toLowerCase())) {
      throw new Error(
        `Row ${i + 1}: this file uses the old yes/no format. Give a probability between 0 and 1 instead — 0.82 means you think the grant is 82% likely to be approved.`,
      );
    }

    const probability = parseFloat(probabilityStr);
    if (isNaN(probability)) {
      throw new Error(`Row ${i + 1}: Probability "${probabilityStr}" is not a valid number`);
    }

    if (probability < 0 || probability > 1) {
      throw new Error(
        `Row ${i + 1}: Probability must be between 0 and 1 — write 82% as 0.82, not 82`,
      );
    }

    results.push({
      project: market.title,
      probability,
    });
  }

  if (results.length === 0) {
    throw new Error("CSV contains no valid data rows");
  }

  return results;
};

/**
 * Zcash NU7 predictions: `question,outcome,prediction`, one row per outcome you have a view on.
 *
 * The only categorical contest here, so a row names both the ballot question (1-5, matching
 * `ZcashNu7Market.id`) and which outcome within it (1-based over the *substantive* outcomes, Invalid
 * excluded). The prediction is the absolute price that one outcome should trade at, in [0, 1] — not
 * a share of the question.
 *
 * Rows may be left out at both levels, but the two omissions no longer mean the same thing:
 *
 * - An omitted **question** means "no view", exactly as in `parseZcashCSV` above. Nothing about it
 *   is traded.
 * - An omitted **outcome** of a question you did annotate means "no view *here*, keep the market's
 *   relative view". `completeNu7Targets` fills it in from the probability your own rows leave over,
 *   and it is traded like any other leg. The outcomes of one question are mutually exclusive, so a
 *   set of targets that does not sum to 1 is not a partial instruction but an incoherent one — see
 *   the header of `@/utils/zcashNu7Targets` for why leaving the gap open costs the user money.
 *
 * Three deliberate departures from the parsers above:
 *
 * 1. Columns are resolved by **header index**, not position. The others check `includes(...)` and
 *    then read `values[0]`, which silently mis-reads a file whose columns were reordered. With three
 *    purely numeric columns that failure is invisible, and it would trade the wrong outcome at the
 *    wrong price.
 * 2. There is **no upper bound on `outcome`**. Outcome strings live on chain and arrive from
 *    MarketView at runtime — `@/utils/zcashNu7Markets` deliberately carries no outcome list, so this
 *    parser cannot know that Q4 has only three substantive outcomes. `4,5,0.3` parses cleanly here
 *    and `useProcessZcashNu7Predictions` reports it as an ignored row.
 * 3. It is the only parser here that checks a **sum**, and it checks only one side of it: a question
 *    summing above 1 is rejected outright, because nothing that could be assigned to the outcomes
 *    left out would bring it back. A question summing *below* 1 is not decidable without the outcome
 *    count, so it is left to the completion step.
 */
export const parseZcashNu7CSV = (csvText: string): ZcashNu7Row[] => {
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row");
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  if (headers.length !== 3) {
    throw new Error("CSV must have exactly 3 columns: question, outcome, prediction");
  }

  const questionIndex = headers.indexOf("question");
  const outcomeIndex = headers.indexOf("outcome");
  const predictionIndex = headers.indexOf("prediction");

  if (questionIndex === -1 || outcomeIndex === -1 || predictionIndex === -1) {
    throw new Error("CSV must have columns: question, outcome, prediction");
  }

  const questionCount = ZCASH_NU7_MARKETS.length;
  const seenCells = new Set<string>();
  const results: ZcashNu7Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(",").map((v) => v.trim());

    if (values.length !== 3) {
      throw new Error(`Row ${i + 1}: Expected 3 columns, found ${values.length}`);
    }

    const questionStr = values[questionIndex];
    const outcomeStr = values[outcomeIndex];
    const predictionStr = values[predictionIndex];

    if (!questionStr || !outcomeStr || !predictionStr) {
      throw new Error(`Row ${i + 1}: All columns must have values`);
    }

    // "Q1" is what the card header prints, so a user typing what they see is not punished.
    const question = Number(questionStr.replace(/^q/i, ""));
    if (!Number.isInteger(question) || question < 1) {
      throw new Error(`Row ${i + 1}: Question "${questionStr}" is not a valid ballot number`);
    }
    if (!ZCASH_NU7_MARKETS.some((market) => market.id === question)) {
      throw new Error(
        `Row ${i + 1}: There is no question ${question} on the NU7 ballot — it has ${questionCount} questions, numbered 1 to ${questionCount}.`,
      );
    }

    const outcome = Number(outcomeStr);
    if (!Number.isInteger(outcome) || outcome < 1) {
      throw new Error(
        `Row ${i + 1}: Outcome "${outcomeStr}" must be a whole number of 1 or more. Outcomes are numbered from 1 in the order they appear on the market card; Invalid is not numbered.`,
      );
    }

    const cell = `${question}-${outcome}`;
    if (seenCells.has(cell)) {
      throw new Error(
        `Row ${i + 1}: Duplicate prediction for question ${question}, outcome ${outcome}`,
      );
    }
    seenCells.add(cell);

    const prediction = parseFloat(predictionStr);
    if (isNaN(prediction)) {
      throw new Error(`Row ${i + 1}: Prediction "${predictionStr}" is not a valid number`);
    }

    if (prediction < 0 || prediction > 1) {
      throw new Error(
        `Row ${i + 1}: Prediction must be between 0 and 1 — write 30% as 0.3, not 30`,
      );
    }

    results.push({ question, outcome, prediction });
  }

  if (results.length === 0) {
    throw new Error("CSV contains no valid data rows");
  }

  // The one sum check this parser can make. A question whose rows already exceed 1 is impossible
  // whatever its on-chain outcome count turns out to be — no assignment to the outcomes left out
  // could bring the total back — so it is caught here rather than after the join, and the upload
  // dialog keeps the user in place to fix the file. The opposite case, a question summing below 1,
  // is NOT decidable here: a short file may be a complete small question or a partial large one,
  // and only the on-chain outcome count says which. `completeNu7Targets` handles it.
  const sumByQuestion = new Map<number, number>();
  for (const row of results) {
    sumByQuestion.set(row.question, (sumByQuestion.get(row.question) ?? 0) + row.prediction);
  }
  for (const [question, sum] of sumByQuestion) {
    if (sum > 1 + NU7_SUM_TOLERANCE) {
      throw new Error(
        `Q${question}: your predictions sum to ${sum.toFixed(2)}. The outcomes of one question are mutually exclusive, so they cannot sum above 1.`,
      );
    }
  }

  return results;
};
