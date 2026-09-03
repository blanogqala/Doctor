import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { superAdminApi } from './super-admin';

describe('Super Admin clinical chart access client', () => {
  it('exposes typed updateClinicalChartAccess on the Super Admin client', () => {
    expect(typeof superAdminApi.updateClinicalChartAccess).toBe('function');
    const source = fs.readFileSync(path.join(__dirname, 'super-admin.ts'), 'utf8');
    expect(source).toMatch(/updateClinicalChartAccess: \(practiceId: string, mode: ClinicalChartAccessMode\)/);
    expect(source).toMatch(/\/api\/super-admin\/practices\/\$\{practiceId\}\/clinical-chart-access/);
    expect(source).toMatch(/method: 'PATCH'/);
    expect(source).toMatch(/saFetch/);
  });
});
