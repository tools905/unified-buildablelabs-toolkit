import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from "react-icons/fa6";
import type { IconType } from "react-icons";
import type { ContentIdeaStatus, ContentPlatform } from "@/lib/db/types";

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
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: ContentIdeaProfile | null;
};

export type ContentMemberOption = {
  id: string;
  label: string;
};

export const CONTENT_COLUMNS: { status: ContentIdeaStatus; label: string }[] = [
  { status: "idea", label: "Raw Material" },
  { status: "approved", label: "In the Beaker" },
  { status: "in_progress", label: "Reacting" },
  { status: "posted", label: "Bottled" },
];

export const PLATFORM_META: Record<ContentPlatform, { label: string; color: string; icon: IconType }> = {
  instagram: { label: "Instagram", color: "#E4405F", icon: FaInstagram },
  linkedin: { label: "LinkedIn", color: "#0A66C2", icon: FaLinkedin },
  x: { label: "X", color: "#14171A", icon: FaXTwitter },
  youtube: { label: "YouTube", color: "#FF0000", icon: FaYoutube },
  facebook: { label: "Facebook", color: "#1877F2", icon: FaFacebook },
};

export const PLATFORM_OPTIONS: ContentPlatform[] = ["instagram", "linkedin", "x", "youtube", "facebook"];
