export type NewsletterPostStatus = "draft" | "scheduled" | "published";

export type NewsletterAuthor = {
  id: string;
  full_name: string | null;
  email: string;
};

export type NewsletterPost = {
  id: string;
  workspace_id: string;
  title: string;
  deck: string | null;
  tag: string | null;
  cover_image_url: string | null;
  cover_brightness: number | null;
  cover_focus_x: number;
  cover_focus_y: number;
  cover_zoom: number;
  cover_fade: "lighter" | "darker" | null;
  body: string;
  author_ids: string[];
  slug: string | null;
  status: NewsletterPostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type NewsletterPostVersion = {
  id: string;
  post_id: string;
  workspace_id: string;
  kind: "session" | "published";
  title: string;
  deck: string | null;
  tag: string | null;
  body: string;
  author_ids: string[];
  cover_image_url: string | null;
  cover_brightness: number | null;
  cover_focus_x: number;
  cover_focus_y: number;
  cover_zoom: number | string;
  cover_fade: "lighter" | "darker" | null;
  edited_by: string | null;
  created_by: string;
  created_at: string;
};

export type NewsletterMemberOption = {
  id: string;
  label: string;
};
