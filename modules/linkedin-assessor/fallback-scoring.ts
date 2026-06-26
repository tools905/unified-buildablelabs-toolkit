import type { LinkedInPostScore } from "./types";

export function createDeterministicLinkedInScore(input: {
  postText: string;
  memberRole: string | null;
}): LinkedInPostScore {
  const text = input.postText.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const firstLine = text.split(/\r?\n/).find(Boolean) ?? text;
  const hashtags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const concrete = /\d|learned|example|because|tradeoff|specific|measured|customer|result/i.test(text);
  const personal = /\bi\b|\bwe\b|today|worked|built|shipped|learned/i.test(text);
  const hasReadableShape = /\n/.test(text) || wordCount < 140;
  const hashtagScore = hashtags.length === 0 ? 3 : hashtags.length <= 4 ? 5 : hashtags.length <= 7 ? 3 : 1;
  const hookScore = Math.min(10, Math.max(4, Math.round(5 + (firstLine.length <= 140 ? 2 : 0) + (/[?:]|\d|learned|mistake|truth|why/i.test(firstLine) ? 2 : 0) + (firstLine.length < 20 ? -1 : 0))));
  const clarityScore = Math.min(10, Math.max(5, Math.round(6 + (hasReadableShape ? 2 : 0) + (wordCount <= 220 ? 1 : 0))));
  const specificityScore = concrete ? 8 : 5;
  const originalityScore = personal ? 8 : 6;
  const readerValueScore = Math.min(12, Math.max(5, Math.round(6 + (concrete ? 3 : 0) + (/how|why|framework|lesson|takeaway/i.test(text) ? 2 : 0))));
  const depthScore = Math.min(10, Math.max(4, Math.round(5 + (wordCount > 60 ? 2 : 0) + (concrete ? 2 : 0))));
  const relevanceScore = Math.min(8, Math.max(5, input.memberRole && input.memberRole !== "unknown" ? 7 : 6));
  const storytellingScore = personal ? 6 : 4;
  const authorityScore = Math.min(7, Math.max(3, Math.round(3 + (concrete ? 2 : 0) + (personal ? 1 : 0))));
  const engagementScore = Math.min(5, Math.max(2, /[?]|\bcomment\b|\bshare\b|\bwhat do you think\b/i.test(text) ? 4 : 3));
  const writingQualityScore = Math.min(5, Math.max(2, Math.round(3 + (hasReadableShape ? 1 : 0) + (/[.!?]$/.test(text) ? 1 : 0))));
  const total = hookScore + clarityScore + specificityScore + originalityScore + readerValueScore + depthScore + relevanceScore + storytellingScore + authorityScore + engagementScore + hashtagScore + writingQualityScore;
  return {
    total_score: total,
    hook_score: hookScore,
    clarity_score: clarityScore,
    specificity_score: specificityScore,
    originality_score: originalityScore,
    reader_value_score: readerValueScore,
    depth_score: depthScore,
    relevance_score: relevanceScore,
    storytelling_score: storytellingScore,
    authority_score: authorityScore,
    engagement_score: engagementScore,
    hashtag_score: hashtagScore,
    writing_quality_score: writingQualityScore,
    archetype: personal ? "lesson_learned" : "educational",
    ai_summary: "Fallback score generated locally because the intelligence provider was unavailable.",
    strengths: ["Clear central idea", "Useful operational framing", "Readable structure"],
    weaknesses: ["Could use more proof", "The opening could be sharper", "The ending could invite a clearer response"],
    improvement_suggestions: ["Add one concrete metric or example.", "Make the first line more specific.", "Close with a direct takeaway or question."],
  };
}
