import { z } from "zod";

/**
 * Env vars required in every environment. Missing/invalid values fail startup
 * loudly instead of surfacing as a confusing runtime error later.
 */
const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Database
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // AI / LLM
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1),
  DEEPSEEK_API_KEY: z.string().min(1),
  DEEPSEEK_MODEL: z.string().min(1),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Cron
  CRON_SECRET: z.string().min(1),

  // Granola (meeting recap ingestion) — optional until configured
  GRANOLA_API_KEY: z.string().min(1).optional(),
  GRANOLA_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Validates process.env against envSchema. Throws with a readable summary of
 * every missing/invalid var (not just the first) so a bad deploy is fixed in
 * one pass instead of one env var at a time.
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n\nCopy .env.example to .env.local and fill in the missing values.`,
    );
  }

  cachedEnv = result.data;
  return cachedEnv;
}

/**
 * Returns the validated env object, running validation on first call.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    return validateEnv();
  }
  return cachedEnv;
}
