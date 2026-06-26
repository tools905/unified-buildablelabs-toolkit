import "server-only";

import { getAppUrl } from "@/lib/utils/app-url";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash";

export function isOpenRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function requestOpenRouterJson<T>(input: {
  system: string;
  user: unknown;
  temperature?: number;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": getAppUrl(),
      "X-Title": "Unified BuildableLabs Toolkit",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: input.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: JSON.stringify(input.user) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") return null;
  return JSON.parse(content) as T;
}
