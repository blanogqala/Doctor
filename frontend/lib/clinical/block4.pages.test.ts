import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function readFromFrontend(...parts: string[]) {
  return fs.readFileSync(path.join(__dirname, ...parts), 'utf8');
}

describe('Block 4 frontend source contracts', () => {
  it('Super Admin workspace renders both modes and requires confirmation both ways', () => {
    const page = readFromFrontend('../../app/super-admin/practices/[id]/page.tsx');
    expect(page).toContain('Clinical chart access');
    expect(page).toContain('clinicalChartAccessLabel');
    expect(page).toContain('CLINICAL_CHART_ACCESS_OPTIONS');
    expect(page).toContain('superAdminApi.updateClinicalChartAccess');
    expect(page).toContain('confirmClinicalChartAccess');
    expect(page).toContain('pendingChartMode');
    expect(page).toContain('chartConfirm?.confirmLabel');
  });

  it('Doctor Records page no longer client-filters assigned doctors and loads patient_id records', () => {
    const page = readFromFrontend('../../app/doctor/records/page.tsx');
    expect(page).not.toMatch(/assigned_doctor_id === user\.doctor/);
    expect(page).toMatch(/setPatients\(patientsResult\.value\)/);
    expect(page).toMatch(/medicalRecordsApi\.list\(\{\s*patient_id: selectedPatientId/);
    expect(page).toContain('PRACTICE_WIDE_CHART_BANNER');
    expect(page).toContain('SHARED_CHART_ACCESS_BADGE');
  });

  it('non-author record view keeps edit/amend behind isAuthor', () => {
    const page = readFromFrontend('../../app/doctor/records/[patientId]/view/[recordId]/page.tsx');
    expect(page).toMatch(/const isAuthor = !!\(user\?\.doctor\?\.id && record\?\.doctor_id === user\.doctor\.id\)/);
    expect(page).toMatch(/const canEdit = isAuthor && !!record && !record\.is_erroneous/);
    expect(page).toContain('Continue Editing');
    expect(page).toContain('Amend / Review');
    expect(page).toMatch(/canEdit && record\.is_draft/);
    expect(page).toMatch(/canEdit && !record\.is_draft/);
  });

  it('Practice Owner sees the policy read-only', () => {
    const page = readFromFrontend('../../app/doctor/practice-management/page.tsx');
    expect(page).toContain('Clinical chart access');
    expect(page).toContain('PRACTICE_OWNER_CHART_ACCESS_NOTE');
    expect(page).toContain('clinicalChartAccessLabel');
    expect(page).not.toMatch(/updateClinicalChartAccess/);
  });

  it('Patient UI does not receive shared-access messaging', () => {
    const patientDir = path.join(__dirname, '../../app/patient');
    const files = walkTsx(patientDir);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toContain('PRACTICE_WIDE_CHART_BANNER');
      expect(source).not.toContain('Practice-wide chart access is enabled');
      expect(source).not.toContain('SHARED_CHART_ACCESS_BADGE');
    }
  });

  it('existing billing READ_ONLY frontend copy is unchanged', () => {
    const access = readFromFrontend('../practice-access.ts');
    expect(access).toMatch(/read-only mode because the subscription payment is overdue/i);
  });
});

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsx(full));
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
