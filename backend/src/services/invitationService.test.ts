import { describe, expect, it } from 'vitest';
import { invitationStatus } from './invitationService';

describe('invitationStatus', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('returns ACCEPTED when acceptedAt is set', () => {
    expect(
      invitationStatus(
        {
          acceptedAt: new Date('2026-08-24T00:00:00.000Z'),
          revokedAt: null,
          expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        now
      )
    ).toBe('ACCEPTED');
  });

  it('returns REVOKED when revoked', () => {
    expect(
      invitationStatus(
        {
          acceptedAt: null,
          revokedAt: new Date('2026-08-24T00:00:00.000Z'),
          expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        now
      )
    ).toBe('REVOKED');
  });

  it('returns EXPIRED when past expiresAt', () => {
    expect(
      invitationStatus(
        {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        now
      )
    ).toBe('EXPIRED');
  });

  it('returns PENDING for a live invitation', () => {
    expect(
      invitationStatus(
        {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        now
      )
    ).toBe('PENDING');
  });
});
