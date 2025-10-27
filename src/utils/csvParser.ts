import { OriginalityRow, PredictionRow } from "@/types";

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
      originality
    });
  }

  if (results.length === 0) {
    throw new Error("CSV contains no valid data rows");
  }

  return results;
};
