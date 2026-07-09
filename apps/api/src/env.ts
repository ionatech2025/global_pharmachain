import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  API_PORT: z.coerce.number().int().default(3001),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  APP_URL: z.url().default("http://localhost:3000"),
  JOBS_IN_PROCESS: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("pharmachain-documents"),
  S3_ACCESS_KEY_ID: z.string().default("minioadmin"),
  S3_SECRET_ACCESS_KEY: z.string().default("minioadmin"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Report which vars are wrong — never their values.
  const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid API environment configuration: ${fields}`);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((o) => o.trim()),
};
