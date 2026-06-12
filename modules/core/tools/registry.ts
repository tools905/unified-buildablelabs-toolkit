import "server-only";

import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export type ToolkitToolSlug = "peer-review" | "linkedin-assessor" | "hr-bot";

export type ToolkitTool = {
  name: string;
  slug: ToolkitToolSlug;
  description: string;
  enabled: boolean;
  adminOnly: boolean;
};

export const toolkitTools: ToolkitTool[] = [
  {
    name: "Peer Review",
    slug: "peer-review",
    description: "Create review cycles, collect peer feedback, and generate team reports.",
    enabled: true,
    adminOnly: false,
  },
  {
    name: "LinkedIn Assessor",
    slug: "linkedin-assessor",
    description: "Track LinkedIn posting quality, consistency, and improvement suggestions.",
    enabled: true,
    adminOnly: false,
  },
  {
    name: "HR Bot",
    slug: "hr-bot",
    description: "Answer approved HR, onboarding, policy, and team handbook questions.",
    enabled: true,
    adminOnly: false,
  },
];

const loadToolkitTools = unstable_cache(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return toolkitTools;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tools")
      .select("name, slug, description, enabled")
      .order("name");

    if (error || !data?.length) return toolkitTools;

    return toolkitTools.map((tool) => {
      const row = data.find((item: { slug: string }) => item.slug === tool.slug);
      return row
        ? {
            ...tool,
            name: row.name ?? tool.name,
            description: row.description ?? tool.description,
            enabled: row.enabled ?? tool.enabled,
          }
        : tool;
    });
  } catch {
    return toolkitTools;
  }
}, ["toolkit-tools"], { revalidate: 30, tags: ["toolkit-tools"] });

export async function listToolkitTools() {
  return loadToolkitTools();
}

export async function getToolkitTool(slug: ToolkitToolSlug) {
  const tools = await listToolkitTools();
  return tools.find((tool) => tool.slug === slug) ?? null;
}

export async function requireEnabledTool(slug: ToolkitToolSlug) {
  const tool = await getToolkitTool(slug);
  if (!tool?.enabled) notFound();
  return tool;
}
