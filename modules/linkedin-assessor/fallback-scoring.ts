import type { LinkedInPostScore } from "./types";

export function createDeterministicLinkedInScore(input: {
  postText: string;
  memberRole: string | null;
}): LinkedInPostScore {
  const wordCount = input.postText.split(/\s+/).filter(Boolean).length;
  const concrete = /\d|learned|example|because|tradeoff|specific/i.test(input.postText);
  const personal = /\bi\b|\bwe\b|today|worked/i.test(input.postText);
  const total = Math.round(Math.min(94, Math.max(42, 48 + Math.min(wordCount, 80) * 0.35 + (concrete ? 7 : 0) + (personal ? 4 : 0))));
  return {
    total_score: total,
    hook_score: Math.min(10, Math.round(total / 11)),
    clarity_score: Math.min(10, Math.round(total / 10)),
    specificity_score: concrete ? 8 : 5,
    originality_score: personal ? 8 : 6,
    reader_value_score: Math.min(15, Math.round(total / 7)),
    depth_score: Math.min(10, Math.round(total / 10)),
    relevance_score: 8,
    storytelling_score: personal ? 6 : 4,
    authority_score: Math.min(7, Math.round(total / 14)),
    engagement_score: Math.min(5, Math.round(total / 22)),
    writing_quality_score: Math.min(5, Math.round(total / 20)),
    archetype: personal ? "lesson_learned" : "educational",
    ai_summary: "Fallback score generated locally because the intelligence provider was unavailable.",
    strengths: ["Clear central idea", "Useful operational framing", "Readable structure"],
    weaknesses: ["Could use more proof", "The opening could be sharper", "The ending could invite a clearer response"],
    improvement_suggestions: ["Add one concrete metric or example.", "Make the first line more specific.", "Close with a direct takeaway or question."],
  };
}
