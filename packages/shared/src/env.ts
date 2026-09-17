import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CADENCEAI_MASTER_KEY: z.string().length(64).optional(),
  CADENCEAI_SESSION: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  E2B_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

// Testing helper — resets memoized env so a test can inject a fresh source.
export function resetEnvForTesting(): void {
  cachedEnv = null;
}
