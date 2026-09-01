/**
 * Public marketing responsive QA (Edge headless via puppeteer-core).
 *
 * Usage (frontend on :3000):
 *   node frontend/scripts/marketing-browser-qa.cjs
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.QA_BASE || 'http://localhost:3000';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1440', width: 1440, height: 900 },
];

const PAGES = [
  { name: 'home', url: `${BASE}/` },
  { name: 'features', url: `${BASE}/features` },
  { name: 'pricing', url: `${BASE}/pricing` },
  { name: 'about', url: `${BASE}/about` },
  { name: 'contact', url: `${BASE}/contact` },
];

const OUT_JSON = path.join(__dirname, '..', '..', 'MARKETING_BROWSER_QA.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'MARKETING_SCREENSHOTS');

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

async function main() {
  if (!fs.existsSync(EDGE)) {
    record('Browser launch', 'NOT RUN', `Edge not found at ${EDGE}`);
    fs.writeFileSync(
      OUT_JSON,
      JSON.stringify({ results, generatedAt: new Date().toISOString() }, null, 2)
    );
    process.exit(0);
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(
      () => /More time with patients/i.test(document.body.innerText),
      { timeout: 20000 }
    );
    const home = await page.evaluate(() => document.body.innerText);
    record(
      'Home positioning',
      /More time with patients/i.test(home) && !/50\+\s*doctors/i.test(home) ? 'PASS' : 'FAIL',
      'headline present, no 50+ doctors'
    );
    record(
      'Home CTAs',
      /Start free trial/i.test(home) && /Book a demo/i.test(home) ? 'PASS' : 'FAIL'
    );

    await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle2', timeout: 60000 });
    const pricing = await page.evaluate(() => document.body.innerText);
    record(
      'Pricing canonical',
      /R800/.test(pricing) && /R1,800/.test(pricing) && /R3,500/.test(pricing) && /Custom/.test(pricing)
        ? 'PASS'
        : 'FAIL'
    );
    record('No Most Popular', /Most Popular/.test(pricing) ? 'FAIL' : 'PASS');

    await page.goto(`${BASE}/contact`, { waitUntil: 'networkidle2', timeout: 60000 });
    const form = await page.$('form');
    record('Contact form', form ? 'PASS' : 'FAIL');

    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const menu = await page.$('button[aria-label="Open menu"]');
    record('Mobile menu control', menu ? 'PASS' : 'FAIL');
    if (menu) {
      await menu.click();
      await new Promise((r) => setTimeout(r, 400));
      const sheet = await page.evaluate(() => /Features/.test(document.body.innerText));
      record('Mobile menu opens', sheet ? 'PASS' : 'FAIL');
      await page.keyboard.press('Escape');
    }

    const matrix = {};
    for (const p of PAGES) {
      matrix[p.name] = {};
      for (const vp of VIEWPORTS) {
        await page.setViewport({ width: vp.width, height: vp.height });
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const o = await measureOverflow(page);
        matrix[p.name][vp.name] = o.overflowX ? 'OVERFLOW' : 'OK';
        const file = path.join(SCREENSHOT_DIR, `${p.name}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        if (o.overflowX) {
          record(`${p.name} ${vp.name}`, 'FAIL', 'horizontal overflow');
        }
      }
    }

    const overflowCount = Object.values(matrix)
      .flatMap((row) => Object.values(row))
      .filter((v) => v === 'OVERFLOW').length;
    record(
      'Responsive overflow matrix',
      overflowCount === 0 ? 'PASS' : 'FAIL',
      `${overflowCount} overflow cells`
    );
  } catch (err) {
    record('Marketing QA', 'FAIL', err.message);
  }

  await browser.close();
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify({ results, generatedAt: new Date().toISOString() }, null, 2)
  );
  const failed = results.some((r) => r.result === 'FAIL');
  process.exit(failed ? 1 : 0);
}

main();
