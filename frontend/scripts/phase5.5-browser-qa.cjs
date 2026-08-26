/**
 * Phase 5.5 browser QA — dashboards + clinical routes with overflow checks and desktop screenshots.
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

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'PHASE5.5_SCREENSHOTS');

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
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('practice_subdomain', 'eastern-cape');
    document.cookie = 'practice_subdomain=eastern-cape; path=/';
  }, res.body.token);
  return res.body;
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

async function probePage(page, route, label) {
  const result = {};
  const joiner = route.includes('?') ? '&' : '?';
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    try {
      await page.goto(`${BASE}${route}${joiner}tenant=${TENANT}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await new Promise((r) => setTimeout(r, 2000));
      const m = await measureOverflow(page);
      result[vp.name] = { status: m.overflowX ? 'ISSUE' : 'PASS', ...m };
      if (vp.name === '1440' && label) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        const safe = label.replace(/[^a-z0-9_-]+/gi, '_');
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${safe}_1440.png`),
          fullPage: true,
        });
      }
    } catch (err) {
      result[vp.name] = {
        status: 'ISSUE',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return result;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const results = [];

  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/login?tenant=${TENANT}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await clinicLogin(page, 'doctor@ecdoctor.co.za');

    const ctx = await page.evaluate(
      async ({ API, TENANT, token }) => {
        const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Subdomain': TENANT };
        const patients = await fetch(`${API}/api/patients`, { headers }).then((r) => r.json());
        const records = await fetch(`${API}/api/medical-records`, { headers }).then((r) => r.json());
        const patient = Array.isArray(patients) ? patients[0] : null;
        const draft = Array.isArray(records) ? records.find((r) => r.is_draft) : null;
        return { patientId: patient?.id ?? null, draftId: draft?.id ?? null };
      },
      { API, TENANT, token: (await page.evaluate(() => localStorage.getItem('token'))) }
    );

    const doctorPages = {
      '/doctor': await probePage(page, '/doctor', 'doctor_dashboard'),
    };
    if (ctx.patientId) {
      doctorPages[`/doctor/records?patient=${ctx.patientId}`] = await probePage(
        page,
        `/doctor/records?patient=${ctx.patientId}`,
        'doctor_patient_folder'
      );
      doctorPages[`/doctor/records/${ctx.patientId}/new`] = await probePage(
        page,
        `/doctor/records/${ctx.patientId}/new`,
        'draft_consultation_editor'
      );
      if (ctx.draftId) {
        doctorPages[`/doctor/records/${ctx.patientId}/edit/${ctx.draftId}`] = await probePage(
          page,
          `/doctor/records/${ctx.patientId}/edit/${ctx.draftId}`,
          'draft_consultation_edit'
        );
      }
    }
    results.push({ role: 'Doctor', pages: doctorPages, context: ctx });
    await page.close();

    for (const [role, email, routes] of [
      ['Reception', 'admin@ecdoctor.co.za', [{ path: '/admin', label: 'reception_dashboard' }]],
      ['Patient', 'patient@ecdoctor.co.za', [{ path: '/patient', label: 'patient_dashboard' }]],
    ]) {
      const p = await browser.newPage();
      await p.goto(`${BASE}/login?tenant=${TENANT}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await clinicLogin(p, email);
      const pages = {};
      for (const r of routes) {
        pages[r.path] = await probePage(p, r.path, r.label);
      }
      results.push({ role, pages });
      await p.close();
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(__dirname, '..', '..', 'PHASE5.5_BROWSER_QA.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
