import type { Patient, PatientPortalStatus, PatientRegistrationSource } from '@/lib/types';

export type OriginFilter = 'ALL' | PatientRegistrationSource;
export type PortalFilter = 'ALL' | PatientPortalStatus;

export function filterPatients(
  patients: Patient[],
  opts: { search?: string; origin?: OriginFilter; portal?: PortalFilter }
): Patient[] {
  const q = (opts.search ?? '').trim().toLowerCase();
  return patients.filter((p) => {
    if (opts.origin && opts.origin !== 'ALL' && p.registration_source !== opts.origin) {
      return false;
    }
    if (opts.portal && opts.portal !== 'ALL' && p.portal_status !== opts.portal) {
      return false;
    }
    if (!q) return true;
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''} ${p.full_name ?? ''} ${p.profile?.full_name ?? ''}`.toLowerCase();
    const id = (p.id_number ?? '').toLowerCase();
    const email = (p.email ?? p.profile?.email ?? '').toLowerCase();
    return name.includes(q) || id.includes(q) || email.includes(q);
  });
}

export function originBadgeLabel(source: PatientRegistrationSource | undefined): string {
  return source === 'RECEPTION_CREATED' ? 'Reception-created' : 'Self-registered';
}

export function portalBadgeLabel(status: PatientPortalStatus | undefined): string {
  switch (status) {
    case 'NO_PORTAL_ACCESS':
      return 'No portal access';
    case 'INVITED':
      return 'Invite sent';
    case 'DISABLED':
      return 'Portal disabled';
    case 'ACTIVE':
    default:
      return 'Portal active';
  }
}
