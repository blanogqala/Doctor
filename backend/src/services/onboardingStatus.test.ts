import { describe, expect, it } from 'vitest';
import { buildOnboardingChecklist } from './onboardingStatus';

describe('onboarding checklist', () => {
  it('marks owner invited when an invitation exists', () => {
    expect(
      buildOnboardingChecklist({
        ownerProfileId: null,
        ownerInvitationExists: true,
        activeReceptionCount: 0,
        activeDoctorCount: 0,
      })
    ).toEqual({
      practiceCreated: true,
      ownerInvited: true,
      ownerActivated: false,
      receptionActive: false,
      doctorActive: false,
    });
  });

  it('marks owner activated when ownerProfileId is set', () => {
    const result = buildOnboardingChecklist({
      ownerProfileId: 'owner-1',
      ownerInvitationExists: true,
      activeReceptionCount: 1,
      activeDoctorCount: 1,
    });
    expect(result.ownerActivated).toBe(true);
    expect(result.receptionActive).toBe(true);
    expect(result.doctorActive).toBe(true);
  });
});
