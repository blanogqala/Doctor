/**
 * Isolation smoke checks for multi-tenant practices.
 * Run with: npx ts-node scripts/isolation-check.ts
 * Requires backend running on PORT (default 3001).
 */
import bcrypt from 'bcryptjs';
import { PrismaClient, SubscriptionStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_URL || 'http://localhost:3001';

async function api(
  path: string,
  opts: { method?: string; token?: string; subdomain?: string; body?: unknown } = {}
) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.subdomain ? { 'X-Tenant-Subdomain': opts.subdomain } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function ensureSecondPractice() {
  const subdomain = 'isolation-b';
  let practice = await prisma.practice.findUnique({ where: { subdomain } });
  if (!practice) {
    practice = await prisma.practice.create({
      data: {
        subdomain,
        clinicName: 'Isolation Clinic B',
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        brandColor: '#0F766E',
      },
    });
  }

  const email = 'admin-b@isolation.test';
  let profile = await prisma.profile.findUnique({
    where: { practiceId_email: { practiceId: practice.id, email } },
  });
  if (!profile) {
    const passwordHash = await bcrypt.hash('Isolation@2026!', 10);
    profile = await prisma.profile.create({
      data: {
        practiceId: practice.id,
        email,
        fullName: 'Admin B',
        role: UserRole.ADMIN,
        passwordHash,
      },
    });
  }

  return { practice, email, password: 'Isolation@2026!' };
}

async function main() {
  const results: { name: string; ok: boolean; detail: string }[] = [];

  // Reserved subdomain rejection via onboard would need super admin; check helper
  const { isReservedSubdomain } = await import('../src/middleware/tenant');
  results.push({
    name: 'reserved subdomain www',
    ok: isReservedSubdomain('www'),
    detail: 'www is reserved',
  });

  const practiceA = await prisma.practice.findUnique({ where: { subdomain: 'eastern-cape' } });
  if (!practiceA) throw new Error('eastern-cape practice missing — run seed');

  const { practice: practiceB, email: emailB, password: passB } = await ensureSecondPractice();

  const loginA = await api('/api/auth/login', {
    method: 'POST',
    subdomain: 'eastern-cape',
    body: { email: 'admin@ecdoctor.co.za', password: 'EasternCape@2026!' },
  });
  results.push({
    name: 'login practice A',
    ok: loginA.status === 200,
    detail: `status=${loginA.status}`,
  });
  const tokenA = (loginA.json as { token?: string })?.token;

  const loginB = await api('/api/auth/login', {
    method: 'POST',
    subdomain: 'isolation-b',
    body: { email: emailB, password: passB },
  });
  results.push({
    name: 'login practice B',
    ok: loginB.status === 200,
    detail: `status=${loginB.status}`,
  });
  const tokenB = (loginB.json as { token?: string })?.token;

  const patientsA = await api('/api/patients', {
    token: tokenA,
    subdomain: 'eastern-cape',
  });
  const listA = Array.isArray(patientsA.json) ? patientsA.json : [];
  results.push({
    name: 'practice A patients list',
    ok: patientsA.status === 200,
    detail: `count=${listA.length}`,
  });

  // Cross-tenant: token A on subdomain B should fail practice mismatch
  const mismatch = await api('/api/patients', {
    token: tokenA,
    subdomain: 'isolation-b',
  });
  results.push({
    name: 'token A rejected on practice B host',
    ok: mismatch.status === 403,
    detail: `status=${mismatch.status}`,
  });

  // Token B cannot see A patients
  const patientsB = await api('/api/patients', {
    token: tokenB,
    subdomain: 'isolation-b',
  });
  const listB = Array.isArray(patientsB.json) ? patientsB.json : [];
  const leaked = listB.some(
    (p: { practice_id?: string }) => p.practice_id && p.practice_id === practiceA.id
  );
  results.push({
    name: 'practice B list has no A patients',
    ok: patientsB.status === 200 && !leaked && listB.length === 0,
    detail: `count=${listB.length} leaked=${leaked}`,
  });

  // If A has a patient, B cannot GET by id
  if (listA[0]?.id) {
    const crossGet = await api(`/api/patients/${listA[0].id}`, {
      token: tokenB,
      subdomain: 'isolation-b',
    });
    results.push({
      name: 'practice B cannot GET practice A patient',
      ok: crossGet.status === 403 || crossGet.status === 404,
      detail: `status=${crossGet.status}`,
    });
  }

  // Suspended practice gate
  await prisma.practice.update({
    where: { id: practiceB.id },
    data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
  });
  const suspended = await api('/api/patients', {
    token: tokenB,
    subdomain: 'isolation-b',
  });
  results.push({
    name: 'suspended practice returns 403',
    ok: suspended.status === 403,
    detail: `status=${suspended.status} code=${(suspended.json as { code?: string })?.code}`,
  });
  await prisma.practice.update({
    where: { id: practiceB.id },
    data: { subscriptionStatus: SubscriptionStatus.ACTIVE },
  });

  // Super admin rejects clinic token
  const sa = await api('/api/super-admin/dashboard', { token: tokenA });
  results.push({
    name: 'clinic JWT rejected on super-admin',
    ok: sa.status === 403 || sa.status === 401,
    detail: `status=${sa.status}`,
  });

  console.log('\n=== Isolation check results ===');
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} — ${r.name} (${r.detail})`);
    if (!r.ok) failed += 1;
  }
  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
