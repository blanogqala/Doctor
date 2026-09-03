import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Block 4 clinical chart access source contracts', () => {
  const medicalRecords = fs.readFileSync(
    path.join(__dirname, '../controllers/medicalRecordController.ts'),
    'utf8'
  );
  const patients = fs.readFileSync(path.join(__dirname, '../controllers/patientController.ts'), 'utf8');
  const appointments = fs.readFileSync(
    path.join(__dirname, '../controllers/appointmentController.ts'),
    'utf8'
  );
  const ai = fs.readFileSync(path.join(__dirname, '../controllers/aiController.ts'), 'utf8');
  const consent = fs.readFileSync(
    path.join(__dirname, '../services/recordingConsentService.ts'),
    'utf8'
  );
  const reception = fs.readFileSync(
    path.join(__dirname, '../services/receptionPatientService.ts'),
    'utf8'
  );
  const saas = fs.readFileSync(path.join(__dirname, '../services/saasPracticeService.ts'), 'utf8');
  const superAdmin = fs.readFileSync(path.join(__dirname, 'super-admin.ts'), 'utf8');
  const publicRoutes = fs.readFileSync(path.join(__dirname, 'public.ts'), 'utf8');
  const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const telemedicine = fs.readFileSync(
    path.join(__dirname, '../controllers/telemedicineController.ts'),
    'utf8'
  );

  it('schema defaults Practice clinical chart access to ASSIGNED_DOCTOR_ONLY', () => {
    expect(schema).toMatch(/enum ClinicalChartAccessMode/);
    expect(schema).toMatch(/clinicalChartAccessMode ClinicalChartAccessMode\s+@default\(ASSIGNED_DOCTOR_ONLY\)/);
  });

  it('patient GET uses clinical helper for Doctors and PATCH stays operational', () => {
    expect(patients).toMatch(/getById:[\s\S]*assertClinicalPatientAccess/);
    expect(patients).toMatch(/update:[\s\S]*assertPatientAccess/);
  });

  it('Doctor patient-scoped MedicalRecord list authorizes the chart and does not force current doctorId', () => {
    expect(medicalRecords).toMatch(/patientIdFilter[\s\S]*assertClinicalPatientAccess/);
    expect(medicalRecords).toMatch(/DO NOT automatically force doctorId|patientIdFilter[\s\S]*scoped/);
    const doctorWithPatient = medicalRecords.match(
      /if \(patientIdFilter\) \{[\s\S]*?return scoped;[\s\S]*?\}/
    )?.[0];
    expect(doctorWithPatient).toBeTruthy();
    expect(doctorWithPatient).not.toMatch(/base\.doctorId = doctorId/);
  });

  it('MedicalRecord create validates appointment ownership and uses current Doctor as author', () => {
    expect(medicalRecords).toMatch(/appointment\.doctorId !== doctorId/);
    expect(medicalRecords).toMatch(/appointment\.patientId !== patientId/);
    expect(medicalRecords).toMatch(/You can only attach records to your own appointments/);
  });

  it('mutations require chart access and authorship', () => {
    expect(medicalRecords).toMatch(/You can only edit your own records/);
    expect(medicalRecords).toMatch(/You can only amend your own records/);
    expect(medicalRecords).toMatch(/You can only attach recordings to your own records/);
    expect(medicalRecords).toMatch(/You can only access recordings for your own records/);
    expect(medicalRecords).toMatch(/update:[\s\S]*assertClinicalPatientAccess[\s\S]*existing\.doctorId !== doctorId/);
  });

  it('consultation audio keeps private no-store cache', () => {
    expect(medicalRecords).toMatch(/Cache-Control', 'private, no-store'/);
  });

  it('AI uses clinical chart access before provider calls', () => {
    expect(ai).toMatch(/assertClinicalPatientAccess/);
    expect(ai).not.toMatch(/assertPatientAccess/);
    expect(ai).toMatch(/assertDoctorClinicalAiAccess/);
    expect(ai).toMatch(/You can only attach AI decisions to your own records/);
  });

  it('recording consent uses clinical chart access and keeps record/appointment ownership', () => {
    expect(consent).toMatch(/assertClinicalPatientAccess/);
    expect(consent).not.toMatch(/assertPatientAccess/);
    expect(consent).toMatch(/You can only record consent for your own records/);
    expect(consent).toMatch(/Appointment is not assigned to this doctor/);
  });

  it('check-up validates the selected Doctor against chart policy', () => {
    expect(appointments).toMatch(/assertDoctorCanAccessPatientChart/);
    expect(appointments).toMatch(/createCheckUp:[\s\S]*assertClinicalPatientAccess/);
  });

  it('telephone new patient is assigned to the booked Doctor in the same transaction', () => {
    expect(reception).toMatch(/assignedDoctorId: params\.doctorId/);
  });

  it('Super Admin dedicated chart-access endpoint exists behind platform auth', () => {
    expect(superAdmin).toMatch(/requirePlatformOrigin, authenticateSuperAdmin, authorizeSuperAdmin/);
    expect(superAdmin).toMatch(/\/practices\/:id\/clinical-chart-access/);
    expect(superAdmin).toMatch(/z\.nativeEnum\(ClinicalChartAccessMode\)/);
  });

  it('policy-change audit is in the Super Admin allowlist; shared chart access is not', () => {
    const allowlist = saas.match(/const SAAS_AUDIT_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
    expect(allowlist).toContain('CLINICAL_CHART_ACCESS_MODE_CHANGED');
    expect(allowlist).not.toContain('CLINICAL_CHART_SHARED_ACCESS');
  });

  it('public practice-info does not expose chart-sharing policy', () => {
    expect(publicRoutes).not.toMatch(/clinicalChartAccessMode|clinical_chart_access_mode/);
  });

  it('telemedicine remains appointment-scoped', () => {
    expect(telemedicine).toMatch(/assertAppointmentAccess/);
    expect(telemedicine).not.toMatch(/assertClinicalPatientAccess/);
  });

  it('Reception MedicalRecord GET remains metadata-only', () => {
    expect(medicalRecords).toMatch(/function toAdminRecordMetadata/);
    expect(medicalRecords).toMatch(/role === UserRole\.ADMIN[\s\S]*toAdminRecordMetadata/);
  });
});
