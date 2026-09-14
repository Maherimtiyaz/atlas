export interface AnalysisResult {
  files: number;
  nodes: number;
}

export function analyze(): AnalysisResult {
  throw new Error('Not implemented');
}
