import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Deployment tier — used for fail-closed storage/config checks. Defaults from NODE_ENV. */
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  /** Optional dedicated Super Admin / platform frontend origin. Defaults to FRONTEND_URL. */
  PLATFORM_FRONTEND_URL: z.string().url().optional(),
  GROQ_API_KEY: z.string().optional(),
  /** Groq HTTP timeout in ms (ASR + LLM). */
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  /** Groq chat model for structured SOAP / scribe extraction (not Whisper). */
  GROQ_SCRIBE_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),
  RESEND_API_KEY: z.string().optional(),
  INQUIRY_NOTIFICATION_EMAIL: z.string().email().default('owner@MediNathi.co.za'),
  RESEND_FROM_EMAIL: z.string().default('MediNathi <notifications@MediNathi.co.za>'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  /** Exact platform/API hostnames (comma-separated). Never inferred as Practice tenants. */
  PLATFORM_HOSTNAME: z.string().optional(),
  /** Base domain for practice.<base> tenant hosts. Unmatched hosts yield no Host-based tenant. */
  APP_BASE_DOMAIN: z.string().optional(),
  /** Private clinical media: local filesystem (dev/test) or Render Persistent Disk. */
  CLINICAL_STORAGE_DRIVER: z.enum(['local', 'render-disk']).default('local'),
  /** Absolute/relative root for private clinical objects. */
  CLINICAL_STORAGE_ROOT: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export function isLiveKitConfigured(): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}
