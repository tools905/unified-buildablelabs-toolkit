import "server-only";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash";

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

export type IntelligenceProvider = "openrouter" | "deepseek";

export type StructuredAnalysisInput = {
  system: string;
  user: unknown;
  temperature?: number;
};

export type IntelligenceJsonResult<T> = {
  data: T;
  provider: IntelligenceProvider;
  model: string;
};

export function isOpenRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function isDeepSeekConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

async function requestJsonFromProvider<T>(input: {
  provider: IntelligenceProvider;
  url: string;
  apiKey: string;
  model: string;
  system: string;
  user: unknown;
  temperature?: number;
}): Promise<IntelligenceJsonResult<T> | null> {
  const response = await fetch(input.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      ...(input.provider === "openrouter"
        ? {
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
            "X-Title": "Unified BuildableLabs Toolkit",
          }
        : {}),
    },
    body: JSON.stringify({
      model: input.model,
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
    throw new Error(`${input.provider} request failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") return null;

  return {
    data: JSON.parse(content) as T,
    provider: input.provider,
    model: input.model,
  };
}

export async function requestIntelligenceJson<T>(
  input: StructuredAnalysisInput,
): Promise<IntelligenceJsonResult<T> | null> {
  const failures: string[] = [];
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (openRouterKey) {
    try {
      return await requestJsonFromProvider<T>({
        ...input,
        provider: "openrouter",
        url: OPENROUTER_URL,
        apiKey: openRouterKey,
        model: OPENROUTER_MODEL,
      });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "OpenRouter failed.");
    }
  }

  const deepSeekKey = process.env.DEEPSEEK_API_KEY;
  if (deepSeekKey) {
    try {
      return await requestJsonFromProvider<T>({
        ...input,
        provider: "deepseek",
        url: DEEPSEEK_URL,
        apiKey: deepSeekKey,
        model: DEEPSEEK_MODEL,
      });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "DeepSeek failed.");
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }

  return null;
}

export async function generateStructuredAnalysis<T>(
  input: StructuredAnalysisInput,
) {
  return requestIntelligenceJson<T>(input);
}

export async function generateSummary<T>(input: StructuredAnalysisInput) {
  return generateStructuredAnalysis<T>(input);
}
