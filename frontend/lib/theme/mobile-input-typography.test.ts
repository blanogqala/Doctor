import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Mobile browsers auto-zoom a focused form control whose computed font-size is
 * below 16px. These are source-level guards so the fix cannot silently regress
 * when someone edits a shared primitive or a page-level override.
 */

const FRONTEND = path.resolve(__dirname, '../..');

function read(...segments: string[]): string {
  return fs.readFileSync(path.join(FRONTEND, ...segments), 'utf8');
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe('shared form primitives render at 16px on mobile', () => {
  const primitives: Array<{ file: string[]; label: string }> = [
    { file: ['components', 'ui', 'input.tsx'], label: 'Input' },
    { file: ['components', 'ui', 'textarea.tsx'], label: 'Textarea' },
    { file: ['components', 'ui', 'select.tsx'], label: 'SelectTrigger' },
    { file: ['components', 'ui', 'command.tsx'], label: 'CommandInput' },
    { file: ['components', 'ui', 'input-otp.tsx'], label: 'InputOTP' },
  ];

  it.each(primitives)('$label uses text-base with an md: step-down', ({ file }) => {
    const source = read(...file);
    expect(source).toMatch(/\btext-base\b/);
    expect(source).toMatch(/\bmd:text-sm\b/);
  });

  it('Input and Textarea do not declare a bare text-sm on the control', () => {
    for (const file of [
      ['components', 'ui', 'input.tsx'],
      ['components', 'ui', 'textarea.tsx'],
    ]) {
      const source = read(...file);
      const bareTextSm = /(?:^|[\s'"])text-sm(?=[\s'"]|$)/m.test(source);
      expect(bareTextSm, `${file.join('/')} still has an unprefixed text-sm`).toBe(false);
    }
  });
});

describe('globals.css mobile form-control floor', () => {
  const css = read('app', 'globals.css');

  it('declares a 16px floor for form controls below the md breakpoint', () => {
    const block = css.match(/@media \(max-width: 767px\)\s*\{[\s\S]*?\n\}/);
    expect(block, 'no max-width: 767px media block found').not.toBeNull();
    const body = block![0];
    expect(body).toMatch(/\binput\b/);
    expect(body).toMatch(/\btextarea\b/);
    expect(body).toMatch(/\bselect\b/);
    expect(body).toMatch(/role='combobox'|role="combobox"/);
    expect(body).toMatch(/font-size:\s*16px/);
  });

  it('lets form controls shrink inside grid and flex parents', () => {
    expect(css).toMatch(/input,\s*\n\s*textarea,\s*\n\s*select\s*\{\s*\n\s*min-width:\s*0;/);
  });

  it('never disables user zoom', () => {
    expect(css).not.toMatch(/user-scalable/i);
    expect(css).not.toMatch(/maximum-scale/i);
  });
});

describe('root viewport configuration', () => {
  const layout = read('app', 'layout.tsx');

  it('sets device-width, initial-scale 1 and viewport-fit cover', () => {
    expect(layout).toMatch(/width:\s*'device-width'/);
    expect(layout).toMatch(/initialScale:\s*1/);
    expect(layout).toMatch(/viewportFit:\s*'cover'/);
  });

  it('does not restrict zoom', () => {
    expect(layout).not.toMatch(/userScalable/);
    expect(layout).not.toMatch(/maximumScale/);
  });
});

describe('page-level overrides keep mobile controls at 16px', () => {
  const sources = [
    ...walk(path.join(FRONTEND, 'app')),
    ...walk(path.join(FRONTEND, 'components')),
  ].filter((file) => !file.includes(`${path.sep}ui${path.sep}`));

  it('scans the frontend tree', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  /**
   * A breakpoint-prefixed class such as `md:text-sm` only applies from 768px up,
   * so it is safe. Only an unprefixed `text-xs`/`text-sm` shrinks the control on
   * a phone.
   */
  function hasUnprefixedSmallText(className: string): boolean {
    return className
      .split(/\s+/)
      .some((token) => token === 'text-xs' || token === 'text-sm');
  }

  it('has no raw input/textarea/select styled with an unprefixed small text class', () => {
    const offenders: string[] = [];

    for (const file of sources) {
      const source = fs.readFileSync(file, 'utf8');
      // Raw form elements bypass the shared primitives entirely.
      const rawControls = source.match(/<(?:input|textarea|select)\b[\s\S]{0,600}?\/?>/g) ?? [];
      for (const control of rawControls) {
        const match = control.match(/className="([^"]*)"/);
        if (match && hasUnprefixedSmallText(match[1])) {
          offenders.push(`${path.relative(FRONTEND, file)}: ${match[1]}`);
        }
      }
    }

    expect(
      offenders,
      `raw form controls below 16px on mobile: ${offenders.join(' | ')}`
    ).toEqual([]);
  });

  it('has no SelectTrigger forcing a small font without an md: prefix', () => {
    const offenders: string[] = [];

    for (const file of sources) {
      const source = fs.readFileSync(file, 'utf8');
      const triggers = source.match(/<SelectTrigger[^>]*>/g) ?? [];
      for (const trigger of triggers) {
        const match = trigger.match(/className="([^"]*)"/);
        if (match && hasUnprefixedSmallText(match[1])) {
          offenders.push(`${path.relative(FRONTEND, file)}: ${match[1]}`);
        }
      }
    }

    expect(
      offenders,
      `SelectTriggers below 16px on mobile: ${offenders.join(' | ')}`
    ).toEqual([]);
  });
});
