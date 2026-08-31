import { describe, expect, it } from 'vitest';
import { findSimilarPatients, patientDisplayName } from './display-name';
import { filterPatients, originBadgeLabel, portalBadgeLabel } from './filters';
import { portalInviteUiState } from './portal-invite';
import type { Patient } from '@/lib/types';

function patient(partial: Partial<Patient>): Patient {
  return {
    id: 'p1',
    profile_id: null,
    first_name: 'Nomsa',
    last_name: 'Dlamini',
    id_number: null,
    id_number_last4: null,
    date_of_birth: null,
    gender: 'UNKNOWN',
    address: null,
    city: null,
    province: null,
    medical_aid_provider: null,
    medical_aid_number: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    assigned_doctor_id: null,
    soft_deleted_at: null,
    created_at: '',
    updated_at: '',
    registration_source: 'RECEPTION_CREATED',
    portal_status: 'NO_PORTAL_ACCESS',
    ...partial,
  };
}

describe('patientDisplayName', () => {
  it('uses first and last name when profile is missing', () => {
    expect(patientDisplayName(patient({}))).toBe('Nomsa Dlamini');
  });

  it('falls back to profile full name', () => {
    expect(
      patientDisplayName(
        patient({
          first_name: '',
          last_name: '',
          profile: {
            id: 'u1',
            full_name: 'Thando Molefe',
            email: 't@example.com',
            role: 'PATIENT',
            phone: null,
            is_active: true,
            last_login_at: null,
            soft_deleted_at: null,
            created_at: '',
            updated_at: '',
          },
        })
      )
    ).toBe('Thando Molefe');
  });
});

describe('findSimilarPatients', () => {
  it('matches exact first and last name and does not auto-merge', () => {
    const list = [
      patient({ id: 'a', first_name: 'Lindiwe', last_name: 'Dlamini' }),
      patient({ id: 'b', first_name: 'Nomsa', last_name: 'Testpatient' }),
    ];
    expect(findSimilarPatients(list, 'Lindiwe', 'Dlamini').map((p) => p.id)).toEqual(['a']);
  });
});

describe('filterPatients', () => {
  it('filters by origin and portal status', () => {
    const list = [
      patient({ id: '1', registration_source: 'RECEPTION_CREATED', portal_status: 'NO_PORTAL_ACCESS' }),
      patient({ id: '2', registration_source: 'SELF_REGISTERED', portal_status: 'ACTIVE' }),
    ];
    expect(filterPatients(list, { origin: 'RECEPTION_CREATED' }).map((p) => p.id)).toEqual(['1']);
    expect(filterPatients(list, { portal: 'ACTIVE' }).map((p) => p.id)).toEqual(['2']);
  });
});

describe('badges', () => {
  it('uses text labels not colour-only', () => {
    expect(originBadgeLabel('RECEPTION_CREATED')).toBe('Reception-created');
    expect(portalBadgeLabel('NO_PORTAL_ACCESS')).toBe('No portal access');
    expect(portalBadgeLabel('ACTIVE')).toBe('Portal active');
  });
});

describe('portalInviteUiState', () => {
  it('disables invite without email', () => {
    const state = portalInviteUiState(patient({ email: null }));
    expect(state.kind).toBe('no_email');
    expect(state.disabled).toBe(true);
    if (state.kind === 'no_email') {
      expect(state.hint).toMatch(/email/i);
    }
  });

  it('allows invite when email is present', () => {
    const state = portalInviteUiState(patient({ email: 'nomsa@example.com' }));
    expect(state.kind).toBe('invite');
    expect(state.disabled).toBe(false);
  });

  it('shows resend after invitation and portal active after activation', () => {
    expect(portalInviteUiState(patient({ email: 'a@b.com', portal_status: 'INVITED' })).kind).toBe(
      'invited'
    );
    expect(portalInviteUiState(patient({ portal_status: 'ACTIVE', profile_id: 'x' })).kind).toBe(
      'active'
    );
  });
});
