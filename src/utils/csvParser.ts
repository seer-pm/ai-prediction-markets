import { PredictionRow } from '../types';

export const parseCSV = (csvText: string): PredictionRow[] => {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  if (headers.length !== 3 || !headers.includes('repo') || !headers.includes('parent') || !headers.includes('weight')) {
    throw new Error('CSV must have columns: repo, parent, weight');
  }
  
  return lines.slice(1).map((line, index) => {
    const values = line.split(',').map(v => v.trim());
    if (values.length !== 3) {
      throw new Error(`Invalid CSV format at line ${index + 2}`);
    }
    
    const weight = parseFloat(values[2]);
    if (isNaN(weight)) {
      throw new Error(`Invalid weight value at line ${index + 2}`);
    }
    
    return {
      repo: values[0],
      parent: values[1],
      weight: weight
    };
  });
};