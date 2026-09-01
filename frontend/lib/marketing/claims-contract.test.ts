import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const FRONTEND = path.resolve(__dirname, '../..');

const BANNED = [
  /50\+\s*doctors/i,
  /trusted by 50/i,
  /POPIA compliant/i,
  /HPCSA compliant/i,
  /bank-level encryption/i,
  /South Africa'?s leading/i,
  /military-grade/i,
  /load shedding proof/i,
];

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe('marketing claims source contract', () => {
  const files = [
    ...walk(path.join(FRONTEND, 'components', 'marketing')),
    ...['features', 'pricing', 'about', 'contact', 'privacy', 'terms'].map((p) =>
      path.join(FRONTEND, 'app', p, 'page.tsx')
    ),
    path.join(FRONTEND, 'app', 'layout.tsx'),
    path.join(FRONTEND, 'lib', 'marketing', 'seo.ts'),
    path.join(FRONTEND, 'lib', 'subscription-plans.ts'),
  ].filter((f) => fs.existsSync(f));

  it('scans marketing sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('does not reintroduce unsupported traction or certification claims', () => {
    const hits: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const pattern of BANNED) {
        if (pattern.test(text)) {
          hits.push(`${path.relative(FRONTEND, file)}: ${pattern}`);
        }
      }
      if (/Most Popular/.test(text)) {
        hits.push(`${path.relative(FRONTEND, file)}: Most Popular`);
      }
      if (/(^|[^A-Za-z])#1([^0-9]|$)/.test(text) && !file.includes('claims-contract')) {
        hits.push(`${path.relative(FRONTEND, file)}: #1`);
      }
    }
    expect(hits).toEqual([]);
  });
});
