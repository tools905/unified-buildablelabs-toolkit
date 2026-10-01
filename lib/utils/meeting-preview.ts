// The meetings page shows a three-line preview on each card and the full recap only when a card is
// opened. Sending every recap in full with the page made it the heaviest page in the app, so the page
// sends a short preview and the card fetches the rest when it is opened.
export const MEETING_PREVIEW_CHARS = 400;

type WithSummary = { summary_markdown: string | null; summary_text: string | null };

export function fullMeetingSummary(meeting: WithSummary) {
  return meeting.summary_markdown || meeting.summary_text || null;
}

export function toMeetingPreview<T extends WithSummary>(meeting: T) {
  const full = fullMeetingSummary(meeting);
  // Everything except the two full-text fields travels to the browser.
  const { summary_markdown, summary_text, ...rest } = meeting;
  void summary_markdown;
  void summary_text;
  const truncated = Boolean(full && full.length > MEETING_PREVIEW_CHARS);
  return {
    ...rest,
    summary_preview: truncated && full ? `${full.slice(0, MEETING_PREVIEW_CHARS).trimEnd()}…` : full,
    summary_truncated: truncated,
  };
}
