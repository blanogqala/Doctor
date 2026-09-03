import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('render.yaml deploy configuration', () => {
  it('9. declares prisma migrate deploy as preDeployCommand for backend web service', () => {
    const raw = readFileSync(resolve(process.cwd(), '..', 'render.yaml'), 'utf8');
    expect(raw).toMatch(/rootDir:\s*backend/);
    expect(raw).toMatch(/preDeployCommand:\s*npx prisma migrate deploy/);
    expect(raw).not.toMatch(/prisma migrate dev/);
    expect(raw).not.toMatch(/prisma db push/);
  });
});
