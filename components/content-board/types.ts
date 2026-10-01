import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from "react-icons/fa6";
import type { IconType } from "react-icons";
import type { ContentAttachmentKind, ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";

export type ContentIdeaProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

export type ContentIdeaWithRelations = {
  id: string;
  workspace_id: string;
  platform: ContentPlatform;
  title: string;
  description: string | null;
  status: ContentIdeaStatus;
  post_url: string | null;
  scheduled_for: string | null;
  reference_links: string[];
  reviewed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: ContentIdeaProfile | null;
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
  isAdmin: boolean;
  history: IdeaPanelHistory;
  attachments: PanelAttachment[];
  points: PanelReviewPoint[];
};

export type ContentMemberOption = {
  id: string;
  label: string;
};

export const CONTENT_COLUMNS: { status: ContentIdeaStatus; label: string }[] = [
  { status: "idea", label: "Ideas" },
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

export const PLATFORM_OPTIONS: ContentPlatform[] = ["instagram", "linkedin", "x", "youtube", "facebook", "blog", "newsletter"];
