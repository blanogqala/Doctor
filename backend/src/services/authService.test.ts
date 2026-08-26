import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@prisma/client';

vi.mock('../config/database', () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    doctor: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('./patientActivationService', () => ({
  createPendingPatientActivation: vi.fn().mockResolvedValue({
    rawToken: 'activation-raw-token',
    record: { id: 'act-1' },
  }),
}));

vi.mock('../utils/secureToken', () => ({
  generateSecureToken: vi.fn().mockReturnValue('secure-random-token-value'),
  hashToken: vi.fn((v: string) => `hash:${v}`),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed'),
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('should-not-be-returned'),
  },
}));

vi.mock('../config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-that-is-long-enough-123456',
    DATABASE_URL: 'postgresql://test',
    PORT: 3001,
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:3000',
  },
}));

import { prisma } from '../config/database';
import { adminCreatePatient, buildAuthUser } from '../services/authService';

const mockedPrisma = prisma as unknown as {
  profile: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  doctor: { findFirst: ReturnType<typeof vi.fn> };
};

describe('adminCreatePatient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not return a temporary password or JWT', async () => {
    mockedPrisma.profile.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.profile.create.mockResolvedValueOnce({
      id: 'profile-1',
      email: 'p@example.com',
      role: UserRole.PATIENT,
      practiceId: 'practice-1',
      doctor: null,
      patient: { id: 'patient-1' },
      practice: null,
    });

    // buildAuthUser does another findUnique
    mockedPrisma.profile.findUnique.mockResolvedValueOnce({
      id: 'profile-1',
      email: 'p@example.com',
      role: UserRole.PATIENT,
      practiceId: 'practice-1',
      softDeletedAt: null,
      doctor: null,
      patient: { id: 'patient-1' },
      practice: null,
    });

    const result = await adminCreatePatient(
      {
        email: 'p@example.com',
        fullName: 'Test Patient',
        patient: {},
      },
      'practice-1'
    );

    expect(result).toHaveProperty('user');
    expect(result).toHaveProperty('activationToken');
    expect(result).not.toHaveProperty('tempPassword');
    expect(result).not.toHaveProperty('token');
  });

  it('sanitizes profile fields in auth user responses', async () => {
    mockedPrisma.profile.findUnique.mockResolvedValueOnce({
      id: 'profile-1',
      email: 'p@example.com',
      role: UserRole.PATIENT,
      practiceId: 'practice-1',
      phone: null,
      isActive: true,
      failedLoginAttempts: 3,
      lockedUntil: new Date('2026-01-01T00:00:00.000Z'),
      lastLoginAt: null,
      softDeletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      passwordHash: 'secret',
      doctor: null,
      patient: { id: 'patient-1' },
      practice: null,
      fullName: 'Test Patient',
    });

    const user = await buildAuthUser('profile-1');
    expect(user).toMatchObject({
      id: 'profile-1',
      profile: {
        id: 'profile-1',
        full_name: 'Test Patient',
        email: 'p@example.com',
      },
    });
    expect(user).not.toMatchObject({
      profile: expect.objectContaining({
        password_hash: expect.anything(),
        failed_login_attempts: expect.anything(),
        locked_until: expect.anything(),
      }),
    });
  });
});
