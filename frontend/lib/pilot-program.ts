export type PilotProgramStatus =
  | 'NOT_GRANTED'
  | 'PENDING_ACTIVATION'
  | 'ACTIVE'
  | 'ENDED';

export function pilotProgramBadgeLabel(status: PilotProgramStatus): string {
  switch (status) {
    case 'PENDING_ACTIVATION':
      return 'Pilot pending';
    case 'ACTIVE':
      return 'Pilot active';
    case 'ENDED':
      return 'Pilot ended';
    default:
      return '';
  }
}

export function onboardReviewTrialLabel(grantPilot: boolean): string {
  return grantPilot
    ? 'Pilot Programme: 30 days from Owner activation'
    : 'Trial access: Standard 14-day trial';
}

export function daysRemaining(endsAt: string | null, now: Date = new Date()): number | null {
  if (!endsAt) return null;
  const endMs = new Date(endsAt).getTime();
  if (Number.isNaN(endMs)) return null;
  const diffMs = endMs - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}
