/**
 * Responsive + mobile input-zoom QA.
 *
 * Verifies, across 320px-1440px:
 *   1. No document-level horizontal overflow (deliberate internal scrollers excluded).
 *   2. Every visible input/textarea/select computes to >= 16px below the `md`
 *      breakpoint, which is what stops mobile browsers auto-zooming on focus.
 *   3. Focusing and typing into a control does not shift or widen the document.
 *   4. No hydration / React console errors.
 *
 * Public routes (marketing + auth) run without a backend. Role dashboards are
 * attempted only when the API is reachable, and are reported as SKIPPED otherwise.
 *
 * Usage (frontend on :3000, backend on :3001):
 *   node frontend/scripts/responsive-input-qa.cjs
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
const PATIENT_EMAIL = process.env.QA_PATIENT_EMAIL || 'patient@ecdoctor.co.za';
const DOCTOR_EMAIL = process.env.QA_DOCTOR_EMAIL || 'doctor@ecdoctor.co.za';
const RECEPTION_EMAIL = process.env.QA_RECEPTION_EMAIL || 'admin@ecdoctor.co.za';

/** Mobile browsers auto-zoom a focused control below this computed size. */
const MIN_MOBILE_FONT_PX = 16;
/** Tailwind `md` — the breakpoint at which desktop typography resumes. */
const MOBILE_MAX_WIDTH = 767;

const VIEWPORTS = [
  { name: '320', width: 320, height: 568 },
  { name: '360', width: 360, height: 740 },
  { name: '375', width: 375, height: 667 },
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1440', width: 1440, height: 900 },
];

const PUBLIC_ROUTES = [
  { name: 'login', url: `${BASE}/login?tenant=${TENANT}` },
  { name: 'register', url: `${BASE}/register?tenant=${TENANT}` },
  { name: 'forgot-password', url: `${BASE}/forgot-password?tenant=${TENANT}` },
  { name: 'reset-password', url: `${BASE}/reset-password?tenant=${TENANT}&token=qa-token` },
  { name: 'invite', url: `${BASE}/invite?tenant=${TENANT}&token=qa-token` },
  { name: 'activate', url: `${BASE}/activate?tenant=${TENANT}&token=qa-token` },
  { name: 'marketing-home', url: `${BASE}/` },
  { name: 'contact', url: `${BASE}/contact` },
];

const ROLE_ROUTES = {
  patient: [
    { name: 'patient-dashboard', url: `${BASE}/patient?tenant=${TENANT}` },
    { name: 'patient-appointments', url: `${BASE}/patient/appointments?tenant=${TENANT}` },
    { name: 'patient-book', url: `${BASE}/patient/book?tenant=${TENANT}` },
    { name: 'patient-records', url: `${BASE}/patient/records?tenant=${TENANT}` },
    { name: 'patient-messages', url: `${BASE}/patient/messages?tenant=${TENANT}` },
    { name: 'patient-payments', url: `${BASE}/patient/payments?tenant=${TENANT}` },
    { name: 'patient-telemedicine', url: `${BASE}/patient/telemedicine?tenant=${TENANT}` },
    { name: 'patient-profile', url: `${BASE}/profile?tenant=${TENANT}` },
  ],
  doctor: [
    { name: 'doctor-dashboard', url: `${BASE}/doctor?tenant=${TENANT}` },
    { name: 'doctor-queue', url: `${BASE}/doctor/queue?tenant=${TENANT}` },
    { name: 'doctor-records', url: `${BASE}/doctor/records?tenant=${TENANT}` },
    { name: 'doctor-messages', url: `${BASE}/doctor/messages?tenant=${TENANT}` },
    { name: 'doctor-telemedicine', url: `${BASE}/doctor/telemedicine?tenant=${TENANT}` },
    { name: 'doctor-practice-mgmt', url: `${BASE}/doctor/practice-management?tenant=${TENANT}` },
    { name: 'doctor-profile', url: `${BASE}/doctor/profile?tenant=${TENANT}` },
  ],
  reception: [
    { name: 'reception-dashboard', url: `${BASE}/admin?tenant=${TENANT}` },
    { name: 'reception-appointments', url: `${BASE}/admin/appointments?tenant=${TENANT}` },
    { name: 'reception-patients', url: `${BASE}/admin/patients?tenant=${TENANT}` },
    { name: 'reception-payments', url: `${BASE}/admin/payments?tenant=${TENANT}` },
    { name: 'reception-messages', url: `${BASE}/admin/messages?tenant=${TENANT}` },
    { name: 'reception-settings', url: `${BASE}/admin/settings?tenant=${TENANT}` },
    { name: 'reception-audit', url: `${BASE}/admin/audit-logs?tenant=${TENANT}` },
  ],
};

const ROLE_EMAILS = {
  patient: PATIENT_EMAIL,
  doctor: DOCTOR_EMAIL,
  reception: RECEPTION_EMAIL,
};

const OUT_JSON = path.join(__dirname, '..', '..', 'RESPONSIVE_INPUT_QA.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'RESPONSIVE_INPUT_QA_SCREENSHOTS');

const results = [];

function record(flow, result, notes) {
  results.push({ flow, result, notes });
  console.log(`[${result}] ${flow}${notes ? ` — ${notes}` : ''}`);
}

/**
 * A route that fails to render still has a body with no overflow and no form
 * controls, which would otherwise be scored as a pass. Every measurement is
 * gated on this check so green results actually mean something.
 */
async function assertPageHealthy(page, status) {
  const probe = await page.evaluate(() => {
    const text = document.body ? document.body.innerText.slice(0, 400) : '';
    return {
      isNextError:
        !!document.querySelector('.next-error-h1') ||
        /Internal Server Error|Application error: a client-side exception|This page could not be found/i.test(
          text
        ),
      stylesheets: document.styleSheets.length,
      hasAppStyles: Array.from(document.styleSheets).some((sheet) => {
        try {
          return (sheet.href || '').includes('/_next/static/css/');
        } catch {
          return false;
        }
      }),
      bodyChars: text.trim().length,
    };
  });

  const problems = [];
  if (status && status >= 400) problems.push(`http ${status}`);
  if (probe.isNextError) problems.push('next error page');
  if (!probe.hasAppStyles) problems.push('app stylesheet missing');
  if (probe.bodyChars < 20) problems.push('empty body');
  return { ...probe, problems };
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
    return {
      scrollWidth,
      clientWidth: doc.clientWidth,
      innerWidth: window.innerWidth,
      overflowX: scrollWidth > doc.clientWidth + 1,
    };
  });
}

/**
 * Identifies which elements actually stick out past the viewport, so an
 * overflow report points at a culprit instead of just a number. Elements inside
 * a deliberate horizontal scroller (a table wrapper, a tab strip) are ignored.
 */
async function findOverflowingElements(page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders = [];

    const insideScroller = (el) => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
        node = node.parentElement;
      }
      return false;
    };

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right <= limit + 1) continue;
      if (insideScroller(el)) continue;
      offenders.push({
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === 'string' ? el.className.slice(0, 160) : '',
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        text: (el.textContent || '').trim().slice(0, 60),
      });
    }

    // Keep the outermost offenders; children inherit their parent's overflow.
    return offenders.slice(0, 8);
  });
}

async function auditFormControlFontSizes(page) {
  return page.evaluate((minPx) => {
    const controls = Array.from(
      document.querySelectorAll('input, textarea, select, [role="combobox"]')
    );
    const offenders = [];
    let checked = 0;

    for (const el of controls) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['checkbox', 'radio', 'range', 'submit', 'button', 'reset'].includes(type)) continue;
      checked += 1;
      const fontSize = parseFloat(style.fontSize);
      if (!(fontSize >= minPx)) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          type: type || null,
          id: el.id || null,
          name: el.getAttribute('name') || null,
          fontSize,
          className: typeof el.className === 'string' ? el.className.slice(0, 160) : '',
        });
      }
    }

    return { checked, offenders };
  }, MIN_MOBILE_FONT_PX);
}

/**
 * Focus, type, and blur each text control, asserting the document neither
 * shifts horizontally nor grows wider. Headless Chromium never applies the
 * mobile focus-zoom itself, so the computed font-size audit remains the
 * authoritative signal; this catches layout jumps and keyboard-induced reflow.
 */
async function exerciseInputFocus(page) {
  const selectors = await page.evaluate(() => {
    const out = [];
    const controls = Array.from(document.querySelectorAll('input, textarea'));
    controls.forEach((el, index) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (el.disabled || el.readOnly) return;
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['checkbox', 'radio', 'range', 'submit', 'button', 'reset', 'file', 'hidden'].includes(type)) return;
      el.setAttribute('data-qa-focus-index', String(index));
      out.push({ selector: `[data-qa-focus-index="${index}"]`, type });
    });
    return out;
  });

  const before = await measureOverflow(page);
  const issues = [];

  for (const control of selectors.slice(0, 12)) {
    try {
      const handle = await page.$(control.selector);
      if (!handle) continue;
      await handle.focus();
      const sample =
        control.type === 'email'
          ? 'qa.tester@example.com'
          : control.type === 'number'
            ? '120'
            : control.type === 'date'
              ? '2026-01-15'
              : control.type === 'tel'
                ? '0821234567'
                : 'MediNathi QA text';
      await page.keyboard.type(sample, { delay: 0 });
      const during = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollX: window.scrollX,
          scrollWidth: Math.max(doc.scrollWidth, document.body?.scrollWidth || 0),
          scale: window.visualViewport ? window.visualViewport.scale : 1,
          fontSize: document.activeElement
            ? parseFloat(getComputedStyle(document.activeElement).fontSize)
            : null,
        };
      });
      await handle.evaluate((el) => el.blur());

      if (during.scrollX !== 0) {
        issues.push({ ...control, problem: `horizontal shift to scrollX=${during.scrollX}` });
      }
      if (during.scrollWidth > before.scrollWidth + 1) {
        issues.push({
          ...control,
          problem: `document widened ${before.scrollWidth}px -> ${during.scrollWidth}px`,
        });
      }
      if (during.scale !== 1) {
        issues.push({ ...control, problem: `visual viewport scale ${during.scale}` });
      }
      if (during.fontSize != null && during.fontSize < MIN_MOBILE_FONT_PX) {
        issues.push({ ...control, problem: `focused font-size ${during.fontSize}px` });
      }
    } catch (err) {
      issues.push({ ...control, problem: `error: ${err.message}` });
    }
  }

  return { exercised: Math.min(selectors.length, 12), total: selectors.length, issues };
}

async function checkViewportMeta(page) {
  const content = await page.evaluate(() => {
    const tags = Array.from(document.querySelectorAll('meta[name="viewport"]'));
    return { count: tags.length, content: tags.map((t) => t.getAttribute('content')) };
  });

  const single = content.count === 1;
  const value = content.content[0] || '';
  const hasDeviceWidth = /width=device-width/.test(value);
  const hasInitialScale = /initial-scale=1/.test(value);
  const hasViewportFit = /viewport-fit=cover/.test(value);
  const blocksZoom = /user-scalable=no|maximum-scale=1/.test(value);

  const ok = single && hasDeviceWidth && hasInitialScale && hasViewportFit && !blocksZoom;
  record(
    'Viewport meta configuration',
    ok ? 'PASS' : 'FAIL',
    `count=${content.count} content="${value}" zoomBlocked=${blocksZoom}`
  );
  return { ...content, ok, blocksZoom };
}

async function clinicLogin(page, email) {
  const res = await page.evaluate(
    async ({ API, TENANT, email, PASSWORD }) => {
      try {
        const r = await fetch(`${API}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-Subdomain': TENANT },
          body: JSON.stringify({ email, password: PASSWORD }),
        });
        const body = await r.json().catch(() => ({}));
        return { ok: r.ok, status: r.status, body };
      } catch (err) {
        return { ok: false, status: 0, body: {}, error: String(err) };
      }
    },
    { API, TENANT, email, PASSWORD }
  );
  if (!res.ok) throw new Error(`Login failed ${email}: ${res.status} ${res.error || ''}`);
  await page.evaluate(
    ({ token, TENANT }) => {
      if (token) localStorage.setItem('token', token);
      localStorage.setItem('practice_subdomain', TENANT);
      document.cookie = `practice_subdomain=${TENANT}; path=/`;
    },
    { token: res.body.token, TENANT }
  );
  return res.body;
}

async function sweep(page, routes, label, matrix, fontMatrix, details) {
  for (const route of routes) {
    matrix[route.name] = {};
    fontMatrix[route.name] = {};

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      try {
        const response = await page.goto(route.url, {
          waitUntil: 'networkidle2',
          timeout: 45000,
        });
        await new Promise((resolve) => setTimeout(resolve, 250));

        const health = await assertPageHealthy(page, response ? response.status() : null);
        if (health.problems.length > 0) {
          matrix[route.name][vp.name] = `UNHEALTHY:${health.problems.join('+')}`;
          fontMatrix[route.name][vp.name] = 'UNHEALTHY';
          details.unhealthy.push({
            route: route.name,
            viewport: vp.name,
            status: response ? response.status() : null,
            problems: health.problems,
          });
          continue;
        }

        const overflow = await measureOverflow(page);
        matrix[route.name][vp.name] = overflow.overflowX ? 'OVERFLOW' : 'OK';

        if (overflow.overflowX) {
          const offenders = await findOverflowingElements(page);
          details.overflow.push({
            route: route.name,
            viewport: vp.name,
            scrollWidth: overflow.scrollWidth,
            clientWidth: overflow.clientWidth,
            offenders,
          });
          fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(SCREENSHOT_DIR, `${route.name}-${vp.name}.png`),
            fullPage: true,
          });
        }

        if (vp.width <= MOBILE_MAX_WIDTH) {
          const fonts = await auditFormControlFontSizes(page);
          fontMatrix[route.name][vp.name] =
            fonts.offenders.length === 0 ? `OK(${fonts.checked})` : `SMALL(${fonts.offenders.length})`;
          if (fonts.offenders.length > 0) {
            details.smallFonts.push({ route: route.name, viewport: vp.name, ...fonts });
          }

          // Focus/type exercise is expensive; run it once per route at 375px.
          if (vp.name === '375') {
            const focus = await exerciseInputFocus(page);
            if (focus.issues.length > 0) {
              details.focusIssues.push({ route: route.name, viewport: vp.name, ...focus });
            }
            details.focusRuns.push({
              route: route.name,
              exercised: focus.exercised,
              total: focus.total,
              issues: focus.issues.length,
            });
          }
        } else {
          fontMatrix[route.name][vp.name] = 'N/A';
        }
      } catch (err) {
        matrix[route.name][vp.name] = `ERR:${err.message.slice(0, 80)}`;
        fontMatrix[route.name][vp.name] = 'ERR';
      }
    }
  }

  const cellsFor = (source) =>
    Object.entries(source)
      .filter(([name]) => routes.some((r) => r.name === name))
      .flatMap(([, row]) => Object.values(row));

  const matrixCells = cellsFor(matrix);
  const overflowCells = matrixCells.filter((v) => v === 'OVERFLOW').length;
  const unhealthyCells = matrixCells.filter(
    (v) => typeof v === 'string' && v.startsWith('UNHEALTHY')
  ).length;
  const fontCells = cellsFor(fontMatrix).filter(
    (v) => typeof v === 'string' && v.startsWith('SMALL')
  ).length;
  const controlsSeen = cellsFor(fontMatrix)
    .map((v) => (typeof v === 'string' ? v.match(/^OK\((\d+)\)$/) : null))
    .reduce((sum, m) => sum + (m ? Number(m[1]) : 0), 0);

  record(
    `${label} — pages rendered healthy`,
    unhealthyCells === 0 ? 'PASS' : 'FAIL',
    `${unhealthyCells} unhealthy cells of ${matrixCells.length}`
  );
  record(
    `${label} — horizontal overflow`,
    overflowCells === 0 && unhealthyCells === 0 ? 'PASS' : 'FAIL',
    `${overflowCells} overflow cells across ${routes.length} routes x ${VIEWPORTS.length} widths`
  );
  record(
    `${label} — mobile input font-size >= ${MIN_MOBILE_FONT_PX}px`,
    fontCells === 0 && unhealthyCells === 0 ? 'PASS' : 'FAIL',
    `${fontCells} route/width combinations with undersized controls; ${controlsSeen} control measurements taken`
  );
}

async function main() {
  if (!fs.existsSync(EDGE)) {
    record('Browser launch', 'FAIL', `Edge not found at ${EDGE} (set EDGE_PATH)`);
    fs.writeFileSync(
      OUT_JSON,
      JSON.stringify({ results, generatedAt: new Date().toISOString() }, null, 2)
    );
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (/hydrat|did not match|Warning: Text content|Minified React error|Maximum update depth/i.test(text)) {
      consoleErrors.push({ type: msg.type(), text: text.slice(0, 300), url: page.url() });
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: String(err).slice(0, 300), url: page.url() });
  });

  const matrix = {};
  const fontMatrix = {};
  const details = {
    overflow: [],
    smallFonts: [],
    focusIssues: [],
    focusRuns: [],
    unhealthy: [],
  };
  let viewportMeta = null;

  try {
    await page.goto(`${BASE}/login?tenant=${TENANT}`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    viewportMeta = await checkViewportMeta(page);

    await sweep(page, PUBLIC_ROUTES, 'Public + auth pages', matrix, fontMatrix, details);

    for (const [role, routes] of Object.entries(ROLE_ROUTES)) {
      try {
        await page.setViewport({ width: 1440, height: 900 });
        await page.goto(`${BASE}/login?tenant=${TENANT}`, {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });
        await clinicLogin(page, ROLE_EMAILS[role]);
        await sweep(
          page,
          routes,
          `${role[0].toUpperCase()}${role.slice(1)} pages`,
          matrix,
          fontMatrix,
          details
        );
      } catch (err) {
        record(`${role} pages`, 'SKIPPED', `backend/login unavailable — ${err.message}`);
      }
    }

    record(
      'Console hydration / React errors',
      consoleErrors.length === 0 ? 'PASS' : 'FAIL',
      `${consoleErrors.length} matching console entries`
    );
  } finally {
    fs.writeFileSync(
      OUT_JSON,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          config: { base: BASE, api: API, tenant: TENANT, minMobileFontPx: MIN_MOBILE_FONT_PX },
          viewports: VIEWPORTS.map((v) => v.name),
          results,
          viewportMeta,
          overflowMatrix: matrix,
          mobileFontMatrix: fontMatrix,
          details,
          consoleErrors,
        },
        null,
        2
      )
    );
    await browser.close();
  }

  const failed = results.filter((r) => r.result === 'FAIL').length;
  console.log(`\nReport written to ${OUT_JSON}`);
  console.log(`${results.length} checks, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  record('Script fatal', 'FAIL', err.message);
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify({ results, generatedAt: new Date().toISOString() }, null, 2)
  );
  process.exit(1);
});
