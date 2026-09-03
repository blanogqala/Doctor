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
  /**
   * How practice tenant links are built for token emails (invite / activate / reset).
   * canonical: PLATFORM_FRONTEND_URL || FRONTEND_URL (operational fallback; ?tenant= UX).
   * subdomain: https://{slug}.{APP_BASE_DOMAIN || FRONTEND_URL host} (production wildcard).
   */
  TENANT_ROUTING_MODE: z.enum(['canonical', 'subdomain']).default('canonical'),
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
  /**
   * Public practice media (logos + doctor photos). local = cwd/uploads/public-media (dev/test only).
   * render-disk = Render Persistent Disk (survives restart/redeploy/sleep).
   * Falls back to PRACTICE_LOGO_STORAGE_DRIVER so existing deploys keep booting.
   */
  PRACTICE_MEDIA_STORAGE_DRIVER: z.enum(['local', 'render-disk']).optional(),
  PRACTICE_MEDIA_STORAGE_ROOT: z.string().optional(),
  /**
   * Legacy logo-only root, retained as a read-through fallback for objects written
   * before public media was unified under PRACTICE_MEDIA_STORAGE_ROOT.
   */
  PRACTICE_LOGO_STORAGE_DRIVER: z.enum(['local', 'render-disk']).default('local'),
  PRACTICE_LOGO_STORAGE_ROOT: z.string().optional(),
  /** Canonical API origin for absolute public asset URLs (e.g. https://api.medinathi.co.za). */
  PUBLIC_API_URL: z
    .string()
    .optional()
    .transform((v) => {
      const trimmed = v?.trim();
      return trimmed ? trimmed : undefined;
    })
    .pipe(z.string().url().optional()),
});

export const env = envSchema.parse(process.env);

export function isLiveKitConfigured(): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}
