export type StructuredAnalysisInput = {
  system: string;
  prompt: string;
  metadata?: Record<string, unknown>;
};

export async function generateStructuredAnalysis(input: StructuredAnalysisInput) {
  void input;
  throw new Error("Shared AI analysis is not configured for this toolkit skeleton yet.");
}

export async function generateSummary(input: StructuredAnalysisInput) {
  return generateStructuredAnalysis(input);
}
