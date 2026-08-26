/**
 * Phase 5 real-browser responsive QA (Edge headless via puppeteer-core).
 * AI Clinical Copilot surfaces: draft editor, folder, transcript evidence, patient privacy.
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
  if (!res.ok) {
    throw new Error(`Clinic login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
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
    const overflowX = scrollWidth > clientWidth + 1;
    return { scrollWidth, clientWidth, overflowX };
  });
}

async function probePage(page, route) {
  const result = {};
  const joiner = route.includes('?') ? '&' : '?';
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    try {
      await page.goto(`${BASE}${route}${joiner}tenant=${TENANT}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await new Promise((r) => setTimeout(r, 2200));
      const m = await measureOverflow(page);
      result[vp.name] = { status: m.overflowX ? 'ISSUE' : 'PASS', ...m };
    } catch (err) {
      result[vp.name] = {
        status: 'ISSUE',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { [route]: result };
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const results = [];

  try {
    {
      const roleResult = { role: 'Doctor', pages: {} };
      const page = await browser.newPage();
      try {
        await page.goto(`${BASE}/login?tenant=${TENANT}`, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });
        const login = await clinicLogin(page, 'doctor@ecdoctor.co.za');
        Object.assign(roleResult.pages, await probePage(page, '/doctor/records'));

        const ctx = await page.evaluate(
          async ({ API, TENANT, token }) => {
            const headers = {
              Authorization: `Bearer ${token}`,
              'X-Tenant-Subdomain': TENANT,
            };
            const patients = await fetch(`${API}/api/patients`, { headers }).then((r) => r.json());
            const records = await fetch(`${API}/api/medical-records`, { headers }).then((r) =>
              r.json()
            );
            const patient = Array.isArray(patients) ? patients[0] : null;
            const record = Array.isArray(records)
              ? records.find((r) => !r.is_draft) || records[0]
              : null;
            const draft = Array.isArray(records) ? records.find((r) => r.is_draft) : null;
            return {
              patientId: patient?.id ?? null,
              recordId: record?.id ?? null,
              draftId: draft?.id ?? null,
            };
          },
          { API, TENANT, token: login.token }
        );

        if (ctx.patientId) {
          Object.assign(
            roleResult.pages,
            await probePage(page, `/doctor/records?patient=${ctx.patientId}`)
          );
          Object.assign(
            roleResult.pages,
            await probePage(page, `/doctor/records/${ctx.patientId}/new`)
          );
        }
        if (ctx.patientId && ctx.recordId) {
          Object.assign(
            roleResult.pages,
            await probePage(
              page,
              `/doctor/records/${ctx.patientId}/view/${ctx.recordId}`
            )
          );
        }
        if (ctx.patientId && ctx.draftId) {
          Object.assign(
            roleResult.pages,
            await probePage(
              page,
              `/doctor/records/${ctx.patientId}/edit/${ctx.draftId}`
            )
          );
        }
        roleResult.context = ctx;
      } catch (err) {
        roleResult.error = err instanceof Error ? err.message : String(err);
      } finally {
        await page.close();
      }
      results.push(roleResult);
    }

    {
      const roleResult = { role: 'Patient', pages: {} };
      const page = await browser.newPage();
      try {
        await page.goto(`${BASE}/login?tenant=${TENANT}`, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });
        await clinicLogin(page, 'patient@ecdoctor.co.za');
        Object.assign(roleResult.pages, await probePage(page, '/patient/records'));
      } catch (err) {
        roleResult.error = err instanceof Error ? err.message : String(err);
      } finally {
        await page.close();
      }
      results.push(roleResult);
    }

    {
      const roleResult = { role: 'Reception', pages: {} };
      const page = await browser.newPage();
      try {
        await page.goto(`${BASE}/login?tenant=${TENANT}`, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });
        await clinicLogin(page, 'admin@ecdoctor.co.za');
        Object.assign(roleResult.pages, await probePage(page, '/admin/patients'));
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

  const outPath = path.join(__dirname, '..', '..', 'PHASE5_BROWSER_QA.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
