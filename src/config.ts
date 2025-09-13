import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3000),
  MISTRAL_API_KEY: z.string().optional(),
  PDF_EXPORT_SERVICE_URL: z.string().url().optional().default("http://localhost:2305"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional().default("us-east-1"),
  S3_BUCKET_NAME: z.string().optional(),
  BRIA_API_KEY: z.string().optional(),
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  if (process.stdout.isTTY) {
    console.error("❌ Invalid environment variables found:", parsedEnv.error.flatten().fieldErrors);
  }
  process.exit(1);
}

export const config = parsedEnv.data;
