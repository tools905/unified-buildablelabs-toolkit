// What each tool is called and how it is described to the AI that uses it. That text is all the AI has to
// go on when it picks a tool, so each one says what the tool is for, how to use it with the others, and
// what to be careful about. The endpoint registers every tool with its entry from here.
//
// Written to the AI ("you") about the person it is helping ("the person"). Keep every entry short, and
// when a tool, field or limit in lib/mcp/contract.ts changes, change the text here to match.

import type { McpToolName } from "@/lib/mcp/contract";

export type McpToolText = { title: string; description: string };

export const MCP_TOOL_TEXT: Record<McpToolName, McpToolText> = {
  list_ideas: {
    title: "List Content Board ideas",
    description: [
      "Lists ideas on the team's Content Board. Use it first to find an idea's id.",
      "Each idea comes with its id, title, platforms, column, scheduled day, number of open review points and number of files.",
      "Filter by platform, column, month (YYYY-MM) or mine_only; leave the filters out to see everything, up to limit (25 by default).",
      "Columns are idea (shown as Ideas), feedback (Feedback), approved (Shortlisted), in_progress (In Progress) and posted (Posted).",
      "If truncated is true there are more ideas than were returned, so narrow the filters.",
      'Example: "what is waiting for feedback this month?" means column feedback and month 2026-10. Then call get_idea on the one you need.',
    ].join(" "),
  },

  get_idea: {
    title: "Get one idea with its files and review points",
    description: [
      "Gets everything about one idea: details, caption, post link, reference links, its files and its review points.",
      "Each file has an id, name, kind (image, pdf or link), size, who uploaded it and when. A design link shows its address in link_url instead of a file.",
      "Use it after list_ideas and before reviewing anything. A PDF's id is what you pass to get_pdf_pages, and the newest PDF is the latest draft.",
      'Example: "review the LinkedIn carousel" means list_ideas with platform linkedin, get_idea on the match, then get_pdf_pages on its newest PDF.',
    ].join(" "),
  },

  get_month_schedule: {
    title: "See the content calendar for a month",
    description: [
      "Shows the content calendar for one month (YYYY-MM): for each day, the ideas planned for it, with id, title and platforms.",
      'Use it for questions like "what is going out in October?" or to spot a busy week or a gap.',
      "It lists ideas only. Call get_idea to read one in full.",
    ].join(" "),
  },

  get_pdf_pages: {
    title: "Look at the pages of a PDF",
    description: [
      "Shows pages of a PDF on an idea as images, so you can read the text and judge the design.",
      "Pass the file's id from get_idea. You get up to 10 pages per call (the first 10 by default) and the total page count.",
      "For a longer PDF ask for the next range with first_page and last_page.",
      "It only works on PDFs, not on images or design links.",
      "Look at every page before giving feedback on a carousel or document: order, headline length, text size, spacing, typos and whether each page makes sense alone.",
    ].join(" "),
  },

  create_idea: {
    title: "Create a new idea on the Content Board",
    description: [
      "Adds a new idea to the Ideas column, as the signed-in person, like the New idea button on the board. Only create an idea the person asked for.",
      "Give it a clear title and at least one platform. Add notes for the team (description), the post text (caption), the day it should go out (scheduled_for) and reference_links when you have them.",
      "It returns the new idea with its id. To add the post itself, call start_upload with that idea_id next.",
      "Call list_ideas first so you don't create a duplicate of an idea that already exists.",
    ].join(" "),
  },

  list_review_points: {
    title: "List the review points on an idea",
    description: [
      "Lists the review points on one idea: the changes the team asked for, with id, text, who wrote it, when, and whether it is done.",
      "Only open points are returned unless you set include_done.",
      "Use it to see what still needs fixing, and before add_review_point so you don't repeat a point that is already there.",
      "Example: after a new PDF is uploaded, list the open points and check each against the new pages with get_pdf_pages.",
    ].join(" "),
  },

  add_review_point: {
    title: "Add a review point to an idea",
    description: [
      "Adds one review point to an idea, like a comment in the Review section of the board. It shows under the person's name, so only add what they asked for or agreed to.",
      'Make each point one clear, specific change and say where it is, for example "Page 3: the headline is too long, cut it to one line." Between 2 and 3000 characters.',
      "It does not change the file.",
      "The first point on an idea in the Ideas column moves it to Feedback, and moved_to_feedback tells you when that happened.",
      "Call list_review_points first to avoid repeating a point.",
    ].join(" "),
  },

  resolve_review_point: {
    title: "Tick off a review point",
    description: [
      "Marks a review point as done (the default), or set done to false to un-tick it. The point's id comes from list_review_points.",
      "Only tick a point after you have looked at the latest file with get_pdf_pages and seen that the change was made. An old point is not a fixed one.",
      "Ticking a point that is already ticked changes nothing.",
    ].join(" "),
  },

  start_upload: {
    title: "Start uploading a file to an idea",
    description: [
      "First step of adding a new file, or a new version of one, to an idea. You cannot send the file yourself.",
      "This returns a one-time upload_url, valid for 15 minutes and usable once. Give it to the person to open in their browser and drop the file on.",
      "Then wait until they say it is done and call confirm_upload with the upload_id.",
      "file_name is the name the file will have, with its extension. It must be a PDF or an image (png, jpg or webp) up to 15 MB, and an idea holds up to 12 files; the result shows files_used and files_max.",
      "To replace a file instead of adding another, pass its id from get_idea as replaces_attachment_id.",
      "The link is the person's own, so don't share or reuse it.",
    ].join(" "),
  },

  confirm_upload: {
    title: "Confirm a file was uploaded",
    description: [
      "Last step of an upload. Call it after the person says they dropped the file on the page from start_upload.",
      "It checks the file arrived and returns its attachment_id, name, page count (for a PDF) and the id of the file it replaced, if any.",
      "If the file isn't there yet, ask the person to finish on the upload page. If the link has expired, call start_upload again.",
      "Afterwards, look at the new version with get_pdf_pages and go through list_review_points to see what can be ticked off.",
    ].join(" "),
  },
};
