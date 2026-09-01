/**
 * One-purpose CLI: create exactly one SuperAdmin row.
 * Not an HTTP endpoint. Does not load the Express server or demo seed.
 *
 * Required env: DATABASE_URL, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
 * Optional env: SUPER_ADMIN_NAME, DATABASE_URL_EXTERNAL (local → Render)
 *
 * From a laptop, Render Internal URLs (host `dpg-…` with no .render.com)
 * are unreachable. Use External Database URL or run this in Render Shell.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 14;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    fail(`Missing required environment variable: ${name}`);
  }
  return raw;
}

function validateEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254 && !email.includes('..');
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `SUPER_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (!/[A-Za-z]/.test(password)) {
    return 'SUPER_ADMIN_PASSWORD must include at least one letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'SUPER_ADMIN_PASSWORD must include at least one number';
  }
  return null;
}

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, '[redacted]')
    .replace(/DATABASE_URL=\S+/gi, 'DATABASE_URL=[redacted]')
    .replace(/dpg-[a-z0-9-]+(?:\.[^\s`:)]+)?/gi, '[redacted-host]');
}

function databaseHostname(url: string): string | null {
  try {
    return new URL(url.replace(/^postgresql:/i, 'http:')).hostname;
  } catch {
    return null;
  }
}

/** Render-private DNS (dpg-xxx) — works on Render, not from a local machine. */
function isRenderInternalDatabaseHost(url: string): boolean {
  const host = databaseHostname(url);
  if (!host) return false;
  return /^dpg-[a-z0-9-]+$/i.test(host);
}

function runningOnRender(): boolean {
  return Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
}

function resolveDatabaseUrl(): void {
  const external = process.env.DATABASE_URL_EXTERNAL?.trim();
  if (external && !runningOnRender()) {
    process.env.DATABASE_URL = external;
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    fail('Missing required environment variable: DATABASE_URL');
  }

  if (isRenderInternalDatabaseHost(url) && !runningOnRender()) {
    fail(
      'DATABASE_URL uses a Render internal hostname, which is not reachable from this machine. ' +
        'Set DATABASE_URL (or DATABASE_URL_EXTERNAL) to the External Database URL from the Render ' +
        'Postgres dashboard (the host ends with .render.com), or run npm run admin:create in the ' +
        'API service Render Shell.'
    );
  }
}

async function main(): Promise<void> {
  resolveDatabaseUrl();

  const email = requireEnv('SUPER_ADMIN_EMAIL').trim().toLowerCase();
  const password = requireEnv('SUPER_ADMIN_PASSWORD');
  const nameRaw = process.env.SUPER_ADMIN_NAME;
  const name =
    typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : 'Platform Owner';

  if (!validateEmail(email)) {
    fail('SUPER_ADMIN_EMAIL is not a valid email address');
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    fail(passwordError);
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.superAdmin.findUnique({ where: { email } });
    if (existing) {
      console.log('Super Admin already exists; no changes made.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await prisma.superAdmin.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'owner',
      },
    });
    console.log(`Super Admin created for ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[admin:create] Failed:', sanitizeError(err));
  process.exit(1);
});
