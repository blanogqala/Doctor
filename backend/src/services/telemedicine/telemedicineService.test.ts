import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UserRole } from '@prisma/client';
import {
  TelemedicineService,
  deriveSessionState,
  evaluateJoinWindow,
  roomNameForAppointment,
} from './telemedicineService';
import type { TelemedicineProvider } from './types';

vi.mock('../../config/database', () => ({
  prisma: {
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    telemedicineConsent: {
      findFirst: vi.fn(),
    },
    patient: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../auditService', () => ({
  logAudit: vi.fn(),
}));

import { prisma } from '../../config/database';

function mockProvider(overrides: Partial<TelemedicineProvider> = {}): TelemedicineProvider {
  return {
    isConfigured: () => true,
    getPublicUrl: () => 'wss://test.livekit.cloud',
    createRoom: vi.fn().mockResolvedValue(undefined),
    createParticipantToken: vi.fn().mockResolvedValue('mock-token'),
    endRoom: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseAppointment = {
  id: 'appt-1',
  practiceId: 'practice-1',
  patientId: 'patient-1',
  doctorId: 'doctor-1',
  scheduledAt: new Date(Date.now() + 10 * 60_000),
  durationMinutes: 30,
  type: 'TELEMEDICINE' as const,
  status: 'CONFIRMED_TELEMEDICINE' as const,
  reason: 'Follow-up',
  softDeletedAt: null,
  consultationStartedAt: null,
  doctorJoinedAt: null,
  patientJoinedAt: null,
  telemedicineRoomId: null,
  telemedicineStartedAt: null,
  telemedicineEndedAt: null,
  lockedByDoctorId: null,
  patientTelemedicineDecision: 'ACCEPTED_VIDEO' as const,
  patient: {
    id: 'patient-1',
    profileId: 'patient-profile',
    profile: { fullName: 'Patient One' },
  },
  doctor: {
    id: 'doctor-1',
    profileId: 'doctor-profile',
    profile: { fullName: 'Dr Test' },
  },
};

describe('telemedicineService helpers', () => {
  it('builds opaque room names', () => {
    expect(roomNameForAppointment('00000000-0000-4000-8000-000000000001')).toBe(
      'medspace-appt-00000000-0000-4000-8000-000000000001'
    );
  });

  it('derives session states', () => {
    expect(
      deriveSessionState({
        patientJoinedAt: null,
        doctorJoinedAt: null,
        telemedicineEndedAt: null,
      })
    ).toBe('NOT_STARTED');
    expect(
      deriveSessionState({
        patientJoinedAt: new Date(),
        doctorJoinedAt: null,
        telemedicineEndedAt: null,
      })
    ).toBe('WAITING');
    expect(
      deriveSessionState({
        patientJoinedAt: new Date(),
        doctorJoinedAt: new Date(),
        telemedicineEndedAt: null,
      })
    ).toBe('ACTIVE');
  });

  it('blocks early join for patients', () => {
    const result = evaluateJoinWindow(
      {
        scheduledAt: new Date(Date.now() + 60 * 60_000),
        durationMinutes: 30,
        status: 'CONFIRMED_TELEMEDICINE',
      },
      UserRole.PATIENT
    );
    expect(result.canJoin).toBe(false);
    expect(result.message).toMatch(/scheduled for/i);
  });
});

describe('TelemedicineService.join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues token for patient in waiting room', async () => {
    const provider = mockProvider();
    const service = new TelemedicineService(provider);

    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(baseAppointment as never);
    vi.mocked(prisma.telemedicineConsent.findFirst).mockResolvedValue({
      id: 'consent-1',
      consentGiven: true,
    } as never);
    vi.mocked(prisma.appointment.update).mockResolvedValue({
      ...baseAppointment,
      patientJoinedAt: new Date(),
    } as never);

    const result = await service.join({
      appointmentId: 'appt-1',
      practiceId: 'practice-1',
      userId: 'patient-profile',
      role: UserRole.PATIENT,
      actorId: 'patient-profile',
    });

    expect(result.livekit.token).toBe('mock-token');
    expect(result.sessionState).toBe('WAITING');
    expect(provider.createRoom).toHaveBeenCalled();
  });

  it('returns 503 when provider is not configured', async () => {
    const provider = mockProvider({ isConfigured: () => false });
    const service = new TelemedicineService(provider);

    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(baseAppointment as never);
    vi.mocked(prisma.telemedicineConsent.findFirst).mockResolvedValue({
      id: 'consent-1',
      consentGiven: true,
    } as never);

    await expect(
      service.join({
        appointmentId: 'appt-1',
        practiceId: 'practice-1',
        userId: 'patient-profile',
        role: UserRole.PATIENT,
        actorId: 'patient-profile',
      })
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
