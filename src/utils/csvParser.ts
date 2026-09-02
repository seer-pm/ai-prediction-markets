import { L2Row, OctantRow, OriginalityRow, PredictionRow, ZcashRow } from "@/types";
import { getZcashMarketByTitle } from "@/utils/zcashMarkets";

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
