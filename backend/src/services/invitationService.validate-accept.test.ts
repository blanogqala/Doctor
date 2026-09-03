import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionStatus, UserRole } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { generateSecureToken, hashToken } from '../utils/secureToken';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  txFindInvitation: vi.fn(),
  txLock: vi.fn(),
  txFindPractice: vi.fn(),
  txFindProfile: vi.fn(),
  txCreateProfile: vi.fn(),
  txUpdatePractice: vi.fn(),
  txUpdateInvitation: vi.fn(),
  txFindDoctor: vi.fn(),
}));

vi.mock('../config/database', () => ({
  prisma: {
    practiceInvitation: { findUnique: mocks.findUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        practiceInvitation: {
          findUnique: mocks.txFindInvitation,
          update: mocks.txUpdateInvitation,
        },
        practice: {
          findFirst: mocks.txFindPractice,
          update: mocks.txUpdatePractice,
        },
        profile: {
          findUnique: mocks.txFindProfile,
          create: mocks.txCreateProfile,
        },
        doctor: {
          findFirst: mocks.txFindDoctor,
        },
      }),
  },
}));

vi.mock('./auditService', () => ({ logAudit: vi.fn() }));
vi.mock('./seatService', () => ({
  lockPracticeRow: (...args: unknown[]) => mocks.txLock(...args),
  assertDoctorSeatAvailable: vi.fn(),
}));

import { acceptInvitation, validateInvitationToken } from './invitationService';

const TOKEN = 'a'.repeat(32);

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    practiceId: 'prac-1',
    email: 'doctor@example.com',
    fullName: 'Dr Pilot',
    role: UserRole.DOCTOR,
    hpcsaNumber: null,
    isPracticeOwner: true,
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    practice: {
      id: 'prac-1',
      clinicName: 'Pilot',
      subdomain: 'pilot',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      doctorSeatLimit: 5,
      ownerProfileId: null,
      softDeletedAt: null,
    },
    ...overrides,
  };
}

describe('validateInvitationToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid pending invitation', async () => {
    mocks.findUnique.mockResolvedValue(pendingInvite());
    const invitation = await validateInvitationToken(TOKEN);
    expect(invitation.practice.clinicName).toBe('Pilot');
    expect(invitation.email).toBe('doctor@example.com');
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken(TOKEN) } })
    );
  });

  it('rejects an invalid token', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(validateInvitationToken(TOKEN)).rejects.toMatchObject({
      statusCode: 404,
      code: 'INVITATION_INVALID',
    });
  });

  it('rejects an expired invitation', async () => {
    mocks.findUnique.mockResolvedValue(
      pendingInvite({ expiresAt: new Date(Date.now() - 1000) })
    );
    await expect(validateInvitationToken(TOKEN)).rejects.toMatchObject({
      statusCode: 410,
      code: 'INVITATION_EXPIRED',
    });
  });

  it('rejects an already-used invitation', async () => {
    mocks.findUnique.mockResolvedValue(pendingInvite({ acceptedAt: new Date() }));
    await expect(validateInvitationToken(TOKEN)).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVITATION_ACCEPTED',
    });
  });

  it('rejects a revoked invitation', async () => {
    mocks.findUnique.mockResolvedValue(pendingInvite({ revokedAt: new Date() }));
    await expect(validateInvitationToken(TOKEN)).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVITATION_REVOKED',
    });
  });
});

describe('acceptInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txFindProfile.mockResolvedValue(null);
    mocks.txFindDoctor.mockResolvedValue(null);
    mocks.txCreateProfile.mockResolvedValue({
      id: 'profile-1',
      practiceId: 'prac-1',
      email: 'doctor@example.com',
      role: UserRole.DOCTOR,
      doctor: { id: 'doc-1' },
    });
    mocks.txUpdatePractice.mockResolvedValue({});
    mocks.txUpdateInvitation.mockResolvedValue({});
    mocks.txLock.mockResolvedValue(undefined);
  });

  it('creates the owner on the existing practice, hashes the password, and consumes the token', async () => {
    const row = pendingInvite();
    mocks.txFindInvitation.mockResolvedValue(row);
    mocks.txFindPractice.mockResolvedValue(row.practice);

    const result = await acceptInvitation(TOKEN, 'SecurePass1');
    expect(result.practice.id).toBe('prac-1');
    expect(result.profile.practiceId).toBe('prac-1');
    expect(result.invitation.isPracticeOwner).toBe(true);

    const createData = mocks.txCreateProfile.mock.calls[0][0].data;
    expect(createData.practiceId).toBe('prac-1');
    expect(createData.role).toBe(UserRole.DOCTOR);
    expect(createData.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(createData.passwordHash).not.toBe('SecurePass1');

    expect(mocks.txUpdatePractice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prac-1' },
        data: { ownerProfileId: 'profile-1' },
      })
    );
    expect(mocks.txUpdateInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ acceptedAt: expect.any(Date) }),
      })
    );
  });

  it('rejects token replay after consume would look up the same hash', async () => {
    mocks.txFindInvitation.mockResolvedValue(pendingInvite({ acceptedAt: new Date() }));
    mocks.txFindPractice.mockResolvedValue(pendingInvite().practice);
    await expect(acceptInvitation(TOKEN, 'SecurePass1')).rejects.toMatchObject({
      code: 'INVITATION_ACCEPTED',
    });
  });

  it('rejects duplicate email in the same practice', async () => {
    mocks.txFindInvitation.mockResolvedValue(pendingInvite());
    mocks.txFindPractice.mockResolvedValue(pendingInvite().practice);
    mocks.txFindProfile.mockResolvedValue({ id: 'existing', softDeletedAt: null });
    await expect(acceptInvitation(TOKEN, 'SecurePass1')).rejects.toBeInstanceOf(AppError);
  });

  it('3. allows owner activation when pending pilot and placeholder trial expired', async () => {
    const practice = {
      id: 'prac-1',
      clinicName: 'Pilot',
      subdomain: 'pilot',
      subscriptionStatus: SubscriptionStatus.TRIAL,
      doctorSeatLimit: 5,
      ownerProfileId: null,
      softDeletedAt: null,
      trialEndsAt: new Date('2020-01-01T00:00:00.000Z'),
      pilotProgramGrantedAt: new Date('2026-09-01T00:00:00.000Z'),
      pilotProgramStartsAt: null,
      pilotProgramEndsAt: null,
    };
    const row = pendingInvite({ practice });
    mocks.txFindInvitation.mockResolvedValue(row);
    mocks.txFindPractice.mockResolvedValue(practice);

    await acceptInvitation(TOKEN, 'SecurePass1');

    expect(mocks.txUpdatePractice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prac-1' },
        data: expect.objectContaining({
          ownerProfileId: 'profile-1',
          pilotProgramStartsAt: expect.any(Date),
          pilotProgramEndsAt: expect.any(Date),
          trialEndsAt: expect.any(Date),
        }),
      })
    );
  });

  it('4. sets fresh 30-day trialEndsAt on pending pilot owner activation', async () => {
    const practice = {
      id: 'prac-1',
      clinicName: 'Pilot',
      subdomain: 'pilot',
      subscriptionStatus: SubscriptionStatus.TRIAL,
      doctorSeatLimit: 5,
      ownerProfileId: null,
      softDeletedAt: null,
      trialEndsAt: new Date('2020-01-01T00:00:00.000Z'),
      pilotProgramGrantedAt: new Date('2026-09-01T00:00:00.000Z'),
      pilotProgramStartsAt: null,
      pilotProgramEndsAt: null,
    };
    const row = pendingInvite({ practice });
    mocks.txFindInvitation.mockResolvedValue(row);
    mocks.txFindPractice.mockResolvedValue(practice);

    await acceptInvitation(TOKEN, 'SecurePass1');

    const updateData = mocks.txUpdatePractice.mock.calls[0][0].data;
    const startsAt = updateData.pilotProgramStartsAt as Date;
    const endsAt = updateData.trialEndsAt as Date;
    expect(endsAt.getTime() - startsAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(endsAt.getTime()).toBe(updateData.pilotProgramEndsAt.getTime());
  });

  it('uses a random token that hashes consistently', () => {
    const raw = generateSecureToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toBe(raw);
  });

  it('allows owner invitation during billing READ_ONLY', async () => {
    const practice = {
      id: 'prac-1',
      clinicName: 'Pilot',
      subdomain: 'pilot',
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
      subscriptionSuspensionReason: 'BILLING_OVERDUE',
      subscriptionSuspendedAt: new Date(),
      trialEndsAt: new Date('2020-01-01T00:00:00.000Z'),
      doctorSeatLimit: 5,
      ownerProfileId: null,
      softDeletedAt: null,
    };
    const row = pendingInvite({ practice, isPracticeOwner: true });
    mocks.txFindInvitation.mockResolvedValue(row);
    mocks.txFindPractice.mockResolvedValue(practice);
    mocks.txFindProfile.mockResolvedValue(null);
    mocks.txCreateProfile.mockResolvedValue({ id: 'profile-1', doctor: null });
    mocks.txUpdatePractice.mockResolvedValue({});
    mocks.txUpdateInvitation.mockResolvedValue({});

    await expect(acceptInvitation(TOKEN, 'SecurePass1')).resolves.toBeTruthy();
  });

  it('blocks non-owner staff invitation during billing READ_ONLY', async () => {
    const practice = {
      id: 'prac-1',
      clinicName: 'Pilot',
      subdomain: 'pilot',
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
      subscriptionSuspensionReason: 'BILLING_OVERDUE',
      subscriptionSuspendedAt: new Date(),
      trialEndsAt: new Date('2020-01-01T00:00:00.000Z'),
      doctorSeatLimit: 5,
      ownerProfileId: 'owner-1',
      softDeletedAt: null,
    };
    const row = pendingInvite({
      practice,
      isPracticeOwner: false,
      email: 'staff@example.com',
    });
    mocks.txFindInvitation.mockResolvedValue(row);
    mocks.txFindPractice.mockResolvedValue(practice);

    await expect(acceptInvitation(TOKEN, 'SecurePass1')).rejects.toMatchObject({
      code: 'PRACTICE_READ_ONLY',
    });
  });
});
