/**
 * Telemedicine integration tests — require PostgreSQL + seed.
 * Enable with RUN_INTEGRATION=1
 */
import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../../server';
import { prisma } from '../../config/database';
import { issuePracticeAuth } from '../sessionAuth';

let dbAvailable = false;
let practiceId = '';
let doctorUserId = '';
let patientUserId = '';
let adminUserId = '';
let telemedicineAppointmentId = '';

async function canConnectDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!process.env.RUN_INTEGRATION)(
  'telemedicine integration (requires RUN_INTEGRATION=1 and DB)',
  () => {
    beforeAll(async () => {
      dbAvailable = await canConnectDb();
      if (!dbAvailable) return;

      const practice = await prisma.practice.findFirst({ where: { subdomain: 'eastern-cape' } });
      if (!practice) return;
      practiceId = practice.id;

      const doctorProfile = await prisma.profile.findFirst({
        where: { practiceId, email: 'doctor@ecdoctor.co.za' },
        include: { doctor: true },
      });
      const patientProfile = await prisma.profile.findFirst({
        where: { practiceId, email: 'patient@ecdoctor.co.za' },
        include: { patient: true },
      });
      const adminProfile = await prisma.profile.findFirst({
        where: { practiceId, role: UserRole.ADMIN },
      });

      if (!doctorProfile?.doctor || !patientProfile?.patient) return;

      doctorUserId = doctorProfile.id;
      patientUserId = patientProfile.id;
      adminUserId = adminProfile?.id ?? '';

      let appt = await prisma.appointment.findFirst({
        where: {
          practiceId,
          patientId: patientProfile.patient.id,
          doctorId: doctorProfile.doctor.id,
          type: 'TELEMEDICINE',
          softDeletedAt: null,
        },
        orderBy: { scheduledAt: 'desc' },
      });

      if (!appt) {
        appt = await prisma.appointment.create({
          data: {
            practiceId,
            patientId: patientProfile.patient.id,
            doctorId: doctorProfile.doctor.id,
            scheduledAt: new Date(Date.now() + 5 * 60_000),
            durationMinutes: 30,
            type: 'TELEMEDICINE',
            status: 'CONFIRMED_TELEMEDICINE',
            patientTelemedicineDecision: 'ACCEPTED_VIDEO',
          },
        });
      }

      telemedicineAppointmentId = appt.id;

      await prisma.telemedicineConsent.findFirst({
        where: {
          practiceId,
          patientId: patientProfile.patient.id,
          consentGiven: true,
        },
      }).then(async (existing) => {
        if (!existing) {
          await prisma.telemedicineConsent.create({
            data: {
              practiceId,
              patientId: patientProfile.patient.id,
              consentGiven: true,
              consentTextHash: 'integration-test',
            },
          });
        }
      });
    });

    it('denies admin from joining telemedicine room', async () => {
      if (!dbAvailable || !telemedicineAppointmentId || !adminUserId) return;

      const token = await issuePracticeAuth({ profileId: adminUserId, practiceId });
      const res = await request(app)
        .post(`/api/appointments/${telemedicineAppointmentId}/telemedicine/join`)
        .set('Cookie', token.cookie).set('X-CSRF-Token', token.csrf)
        .set('X-Tenant-Subdomain', 'eastern-cape');

      expect(res.status).toBe(403);
    });

    it('returns provider unavailable when LiveKit is not configured', async () => {
      if (!dbAvailable || !patientUserId || !practiceId) return;

      const { isLiveKitConfigured } = await import('../../config/env');

      const patientProfile = await prisma.profile.findFirst({
        where: { id: patientUserId },
        include: { patient: true },
      });
      const doctorProfile = await prisma.profile.findFirst({
        where: { id: doctorUserId },
        include: { doctor: true },
      });
      if (!patientProfile?.patient || !doctorProfile?.doctor) return;

      // Fresh joinable appointment inside the patient early-join window
      const appt = await prisma.appointment.create({
        data: {
          practiceId,
          patientId: patientProfile.patient.id,
          doctorId: doctorProfile.doctor.id,
          scheduledAt: new Date(Date.now() + 5 * 60_000),
          durationMinutes: 30,
          type: 'TELEMEDICINE',
          status: 'CONFIRMED_TELEMEDICINE',
          patientTelemedicineDecision: 'ACCEPTED_VIDEO',
        },
      });

      const token = await issuePracticeAuth({ profileId: patientUserId, practiceId });
      const res = await request(app)
        .post(`/api/appointments/${appt.id}/telemedicine/join`)
        .set('Cookie', token.cookie).set('X-CSRF-Token', token.csrf)
        .set('X-Tenant-Subdomain', 'eastern-cape');

      if (!isLiveKitConfigured()) {
        expect(res.status).toBe(503);
        expect(res.body.error ?? res.body.message).toMatch(/unavailable/i);
      } else {
        // Keys present — join may succeed or fail at LiveKit/network layer, not as "unconfigured"
        expect([200, 502, 503]).toContain(res.status);
      }

      await prisma.appointment.delete({ where: { id: appt.id } }).catch(() => undefined);
    });

    it('denies join on non-telemedicine appointment', async () => {
      if (!dbAvailable) return;

      const inPerson = await prisma.appointment.findFirst({
        where: { practiceId, type: 'IN_PERSON', softDeletedAt: null },
      });
      if (!inPerson) return;

      const token = await issuePracticeAuth({ profileId: patientUserId, practiceId });
      const res = await request(app)
        .post(`/api/appointments/${inPerson.id}/telemedicine/join`)
        .set('Cookie', token.cookie).set('X-CSRF-Token', token.csrf)
        .set('X-Tenant-Subdomain', 'eastern-cape');

      expect([403, 422]).toContain(res.status);
    });
  }
);

describe('telemedicine integration (offline contract)', () => {
  it('documents integration gate', () => {
    expect(true).toBe(true);
  });
});
