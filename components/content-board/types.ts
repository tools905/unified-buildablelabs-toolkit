import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from "react-icons/fa6";
import type { IconType } from "react-icons";
import type { ContentAttachmentKind, ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";

export type ContentIdeaProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

// Someone an idea is assigned to. PostgREST may give the embedded profile as one object or a list.
export type IdeaAssignee = {
  user_id: string;
  profile: ContentIdeaProfile | ContentIdeaProfile[] | null;
};

export function assigneeProfile(assignee: IdeaAssignee): ContentIdeaProfile | null {
  return Array.isArray(assignee.profile) ? (assignee.profile[0] ?? null) : assignee.profile;
}

export function assigneeLabel(assignee: IdeaAssignee) {
  const profile = assigneeProfile(assignee);
  return profile?.full_name || profile?.email || "Unknown";
}

export type ContentIdeaWithRelations = {
  id: string;
  workspace_id: string;
  platform: ContentPlatform;
  // Every platform the idea is planned for. Older rows may have it empty: use ideaPlatforms().
  platforms?: ContentPlatform[];
  title: string;
  description: string | null;
  // The post text as it would appear under the images; null until someone writes it.
  caption: string | null;
  status: ContentIdeaStatus;
  post_url: string | null;
  scheduled_for: string | null;
  reference_links: string[];
  reviewed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: ContentIdeaProfile | null;
  assignees: IdeaAssignee[];
  attachment_count: number;
  review_count: number;
  open_review_count: number;
  thumbnail: { kind: ContentAttachmentKind; url: string | null } | null;
};

export type PanelAttachment = {
  id: string;
  kind: ContentAttachmentKind;
  fileName: string | null;
  // Signed URL for images/PDFs, the original address for links.
  url: string | null;
  // Only set for links that can be shown inside the panel.
  embedUrl: string | null;
  createdAt: string;
  uploaderName: string;
};

export type PanelReviewPoint = {
  id: string;
  body: string;
  isResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  authorId: string;
  authorName: string;
};

export type IdeaPanelHistory = {
  createdAt: string;
  creatorName: string;
  postedAt: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
};

export type IdeaPanelData = {
  workspaceId: string;
  currentUserId: string;
  currentUserName: string;
  isAdmin: boolean;
  history: IdeaPanelHistory;
  attachments: PanelAttachment[];
  points: PanelReviewPoint[];
};

export type ContentMemberOption = {
  id: string;
  label: string;
  email?: string;
};

export const CONTENT_COLUMNS: { status: ContentIdeaStatus; label: string }[] = [
  { status: "idea", label: "Ideas" },
  { status: "feedback", label: "Feedback" },
  { status: "approved", label: "Shortlisted" },
  { status: "in_progress", label: "In Progress" },
  { status: "posted", label: "Posted" },
];

export const PLATFORM_META: Record<ContentPlatform, { label: string; color: string; icon: IconType | null }> = {
  instagram: { label: "Instagram", color: "#E4405F", icon: FaInstagram },
  linkedin: { label: "LinkedIn", color: "#0A66C2", icon: FaLinkedin },
  x: { label: "X", color: "#14171A", icon: FaXTwitter },
  youtube: { label: "YouTube", color: "#FF0000", icon: FaYoutube },
  facebook: { label: "Facebook", color: "#1877F2", icon: FaFacebook },
  // Written channels have no brand icon: the tag is just the name. Both use the website's
  // brand blue (--blue), so they read as "our own channels" next to the social platforms.
  blog: { label: "Blog", color: "#0B3FDE", icon: null },
  newsletter: { label: "Newsletter", color: "#0B3FDE", icon: null },
};

// Never throw for a platform this build doesn't know about (e.g. one added to the database
// before the app was redeployed): show a neutral tag instead of crashing the whole board.
export function platformMeta(platform: string) {
  return (
    (PLATFORM_META as Record<string, (typeof PLATFORM_META)[ContentPlatform] | undefined>)[platform] ?? {
      label: platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Other",
      color: "#565D6E",
      icon: null,
    }
  );
}

// The platforms of an idea in a fixed order. Falls back to the single `platform` for rows saved
// before several platforms were possible.
export function ideaPlatforms(idea: { platform: string; platforms?: string[] | null }): string[] {
  const list = idea.platforms?.length ? idea.platforms : [idea.platform];
  const known = PLATFORM_OPTIONS.filter((option) => list.includes(option));
  const unknown = list.filter((value) => !PLATFORM_OPTIONS.includes(value as ContentPlatform));
  return [...known, ...unknown];
}

export const PLATFORM_OPTIONS: ContentPlatform[] = ["instagram", "linkedin", "x", "youtube", "facebook", "blog", "newsletter"];
