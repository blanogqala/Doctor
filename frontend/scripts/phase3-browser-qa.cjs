/**
 * Phase 3 real-browser responsive QA (Edge headless via puppeteer-core).
 * Checks root horizontal overflow at required viewports after role login.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.QA_BASE || 'http://localhost:3000';
const API = process.env.QA_API || 'http://localhost:3001';
const TENANT = 'eastern-cape';
const PASSWORD = 'EasternCape@2026!';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1440', width: 1440, height: 900 },
];

const ROLES = [
  {
    role: 'Doctor',
    email: 'doctor@ecdoctor.co.za',
    path: '/doctor',
    extra: ['/doctor'],
  },
  {
    role: 'Reception',
    email: 'admin@ecdoctor.co.za',
    path: '/admin',
    extra: ['/admin', '/admin/patients'],
  },
  {
    role: 'Patient',
    email: 'patient@ecdoctor.co.za',
    path: '/patient',
    extra: ['/patient'],
  },
  {
    role: 'Platform Admin',
    email: 'owner@ecdoctor.co.za',
    path: '/super-admin/dashboard',
    superAdmin: true,
    extra: ['/super-admin/dashboard', '/super-admin/practices', '/super-admin/support'],
  },
];

async function clinicLogin(page, email) {
  const res = await page.evaluate(
    async ({ API, TENANT, email, PASSWORD }) => {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Subdomain': TENANT,
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      });
      const body = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, body };
    },
    { API, TENANT, email, PASSWORD }
  );
  if (!res.ok) throw new Error(`Clinic login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('practice_subdomain', 'eastern-cape');
    document.cookie = 'practice_subdomain=eastern-cape; path=/';
  }, res.body.token);
}

async function superAdminLogin(page, email) {
  const res = await page.evaluate(
    async ({ API, email, PASSWORD }) => {
      const r = await fetch(`${API}/api/super-admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD }),
      });
      const body = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, body };
    },
    { API, email, PASSWORD }
  );
  if (!res.ok) throw new Error(`SA login failed: ${res.status} ${JSON.stringify(res.body)}`);
  await page.evaluate((token) => {
    localStorage.setItem('super_admin_token', token);
  }, res.body.token);
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
    const clientWidth = doc.clientWidth;
    const overflowX = scrollWidth > clientWidth + 1;
    return { scrollWidth, clientWidth, overflowX };
  });
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const results = [];

  try {
    for (const role of ROLES) {
      const roleResult = { role: role.role, pages: {} };
      const page = await browser.newPage();

      try {
        await page.goto(`${BASE}/login?tenant=${TENANT}`, { waitUntil: 'networkidle2', timeout: 60000 });
        if (role.superAdmin) {
          await page.goto(`${BASE}/super-admin/login`, { waitUntil: 'networkidle2', timeout: 60000 });
          await superAdminLogin(page, role.email);
        } else {
          await clinicLogin(page, role.email);
        }

        for (const route of role.extra) {
          const pageKey = route;
          roleResult.pages[pageKey] = {};

          for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
            const url = role.superAdmin
              ? `${BASE}${route}`
              : `${BASE}${route}?tenant=${TENANT}`;
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            // Allow client dashboards to fetch
            await new Promise((r) => setTimeout(r, 1500));
            const m = await measureOverflow(page);
            const status = m.overflowX ? 'ISSUE' : 'PASS';
            roleResult.pages[pageKey][vp.name] = { status, ...m };
          }
        }
      } catch (err) {
        roleResult.error = err instanceof Error ? err.message : String(err);
      } finally {
        await page.close();
      }

      results.push(roleResult);
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(__dirname, '..', '..', 'PHASE3_BROWSER_QA.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
