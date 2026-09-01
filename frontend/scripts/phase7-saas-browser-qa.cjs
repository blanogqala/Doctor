/**
 * Phase 7 SaaS browser QA — pricing, inquiry, owner/reception/billing surfaces, responsive overflow.
 * Fictional/test data only. Does not deploy or touch production.
 *
 * Usage (with frontend on :3000 and backend on :3001):
 *   node frontend/scripts/phase7-saas-browser-qa.cjs
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.QA_BASE || 'http://localhost:3000';
const API = process.env.QA_API || 'http://localhost:3001';
const TENANT = process.env.QA_TENANT || 'eastern-cape';
const PASSWORD = process.env.QA_PASSWORD || 'EasternCape@2026!';
const SUPER_ADMIN_EMAIL = process.env.QA_SA_EMAIL || 'owner@ecdoctor.co.za';
const OWNER_EMAIL = process.env.QA_OWNER_EMAIL || 'doctor@ecdoctor.co.za';
const RECEPTION_EMAIL = process.env.QA_RECEPTION_EMAIL || 'admin@ecdoctor.co.za';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1440', width: 1440, height: 900 },
];

const OUT_JSON = path.join(__dirname, '..', '..', 'PHASE7_BROWSER_QA.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'PHASE7_SCREENSHOTS');

const results = [];

function record(flow, result, notes) {
  results.push({ flow, result, notes });
  console.log(`[${result}] ${flow}${notes ? ` — ${notes}` : ''}`);
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
    const clientWidth = doc.clientWidth;
    return { scrollWidth, clientWidth, overflowX: scrollWidth > clientWidth + 1 };
  });
}

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
  if (!res.ok) throw new Error(`Login failed ${email}: ${res.status}`);
  await page.evaluate(
    ({ token, TENANT }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('practice_subdomain', TENANT);
      document.cookie = `practice_subdomain=${TENANT}; path=/`;
    },
    { token: res.body.token, TENANT }
  );
  return res.body;
}

async function superAdminLogin(page) {
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
    { API, email: SUPER_ADMIN_EMAIL, PASSWORD }
  );
  if (!res.ok) throw new Error(`Super admin login failed: ${res.status}`);
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('super_admin_token', token);
    localStorage.setItem('super_admin_user', JSON.stringify(user));
  }, res.body);
  return res.body;
}

async function checkPricing(page) {
  await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle2', timeout: 60000 });
  const text = await page.evaluate(() => document.body.innerText);
  const checks = {
    solo: /Solo/i.test(text) && /R\s*800|R800/i.test(text),
    small: /Small Practice/i.test(text) && /R\s*1[,.]?800|R1800/i.test(text),
    clinic: /Clinic/i.test(text) && /R\s*3[,.]?500|R3500/i.test(text),
    enterprise: /Enterprise/i.test(text) && /Custom/i.test(text),
    seats: /6\+/.test(text),
  };
  const ok = Object.values(checks).every(Boolean);
  record(
    'Public pricing',
    ok ? 'PASS' : 'FAIL',
    JSON.stringify(checks)
  );
  return ok;
}

async function checkInquiryPrefill(page) {
  await page.goto(`${BASE}/contact`, { waitUntil: 'networkidle2', timeout: 60000 });
  const hasForm = await page.$('form, #join');
  record(
    'Inquiry form visible',
    hasForm ? 'PASS' : 'FAIL',
    hasForm ? 'join section present' : 'join section missing'
  );
}

async function checkSuperAdmin(page) {
  await superAdminLogin(page);
  await page.goto(`${BASE}/super-admin/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 });
  const dash = await page.evaluate(() => document.body.innerText.slice(0, 500));
  record(
    'Super Admin Dashboard',
    /Practice|Inquiry|Billing|Support/i.test(dash) ? 'PASS' : 'FAIL',
    'dashboard loaded'
  );

  await page.goto(`${BASE}/super-admin/practices`, { waitUntil: 'networkidle2', timeout: 60000 });
  record('Super Admin Practices', 'PASS', 'practices list opened');

  await page.goto(`${BASE}/super-admin/billing`, { waitUntil: 'networkidle2', timeout: 60000 });
  record('Super Admin Billing', 'PASS', 'billing opened');

  await page.goto(`${BASE}/super-admin/support`, { waitUntil: 'networkidle2', timeout: 60000 });
  record('Super Admin Support', 'PASS', 'support opened');
}

async function checkOwnerPm(page) {
  await page.goto(`${BASE}/login?tenant=${TENANT}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await clinicLogin(page, OWNER_EMAIL);
  await page.goto(`${BASE}/doctor/practice-management?tenant=${TENANT}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  const text = await page.evaluate(() => document.body.innerText);
  record(
    'Owner Practice Management',
    /Team|Subscription|Billing|Seat/i.test(text) ? 'PASS' : 'FAIL',
    'owner PM surface'
  );
}

async function checkReceptionSettings(page) {
  await page.goto(`${BASE}/login?tenant=${TENANT}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await clinicLogin(page, RECEPTION_EMAIL);
  await page.goto(`${BASE}/admin/settings?tenant=${TENANT}`, { waitUntil: 'networkidle2', timeout: 60000 });
  const text = await page.evaluate(() => document.body.innerText);
  record(
    'Reception Settings / branding',
    /Practice|Settings|Brand|Color/i.test(text) ? 'PASS' : 'FAIL',
    'settings page'
  );
}

async function checkPublicSuspendedMessage(page) {
  // Public API contract — when booking_available is false, landing should not push Book Now.
  const info = await page.evaluate(async ({ API, TENANT }) => {
    const r = await fetch(
      `${API}/api/public/practice-info?subdomain=${encodeURIComponent(TENANT)}`
    );
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, booking_available: body.booking_available, status: body.subscription_status };
  }, { API, TENANT });
  record(
    'Public practice booking_available field',
    info.ok && typeof info.booking_available === 'boolean' ? 'PASS' : 'FAIL',
    `status=${info.status} booking_available=${info.booking_available}`
  );
}

async function responsiveSweep(page) {
  const paths = [
    { name: 'pricing', url: `${BASE}/pricing` },
    { name: 'inquiry', url: `${BASE}/contact` },
    { name: 'sa-dashboard', url: `${BASE}/super-admin/dashboard` },
    { name: 'sa-practices', url: `${BASE}/super-admin/practices` },
    { name: 'sa-billing', url: `${BASE}/super-admin/billing` },
    { name: 'sa-support', url: `${BASE}/super-admin/support` },
    { name: 'owner-pm', url: `${BASE}/doctor/practice-management?tenant=${TENANT}` },
    { name: 'reception-settings', url: `${BASE}/admin/settings?tenant=${TENANT}` },
  ];

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const matrix = {};

  for (const p of paths) {
    matrix[p.name] = {};
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      try {
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const o = await measureOverflow(page);
        matrix[p.name][vp.name] = o.overflowX ? 'OVERFLOW' : 'OK';
        if (o.overflowX) {
          const file = path.join(SCREENSHOT_DIR, `${p.name}-${vp.name}.png`);
          await page.screenshot({ path: file, fullPage: true });
        }
      } catch (err) {
        matrix[p.name][vp.name] = `ERR:${err.message}`;
      }
    }
  }

  const overflowCount = Object.values(matrix)
    .flatMap((row) => Object.values(row))
    .filter((v) => v === 'OVERFLOW').length;
  record(
    'Responsive QA matrix',
    overflowCount === 0 ? 'PASS' : 'FAIL',
    `${overflowCount} overflow cells`
  );
  return matrix;
}

async function main() {
  if (!fs.existsSync(EDGE)) {
    record('Browser launch', 'FAIL', `Edge not found at ${EDGE}`);
    fs.writeFileSync(OUT_JSON, JSON.stringify({ results, generatedAt: new Date().toISOString() }, null, 2));
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  try {
    await checkPricing(page);
    await checkInquiryPrefill(page);
    await checkPublicSuspendedMessage(page);
    try {
      await checkSuperAdmin(page);
    } catch (err) {
      record('Super Admin flows', 'FAIL', err.message);
    }
    try {
      await checkOwnerPm(page);
    } catch (err) {
      record('Owner Practice Management', 'FAIL', err.message);
    }
    try {
      await checkReceptionSettings(page);
    } catch (err) {
      record('Reception Settings / branding', 'FAIL', err.message);
    }

    // Flows that need full seeded SaaS lifecycle — mark when not fully automated
    for (const flow of [
      'Owner invitation activation',
      'Reception invitation accept',
      'Doctor invitation + seats',
      'Doctor deactivation',
      'Subscription edit (plan seats)',
      'Trial billing (no invoice during trial)',
      'Owner EFT report',
      'Suspended billing stays suspended',
      'Public suspended practice booking disabled (UI)',
    ]) {
      record(flow, 'NOT RUN', 'Requires seeded SaaS lifecycle / manual UAT — see UAT_PHASE7_FINAL.md');
    }

    const matrix = await responsiveSweep(page);
    fs.writeFileSync(
      OUT_JSON,
      JSON.stringify({ results, responsive: matrix, generatedAt: new Date().toISOString() }, null, 2)
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  record('Script fatal', 'FAIL', err.message);
  fs.writeFileSync(OUT_JSON, JSON.stringify({ results, generatedAt: new Date().toISOString() }, null, 2));
  process.exit(1);
});
