import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import type {
  AppointmentStatus,
  AppointmentType,
  PaymentStatus,
  PaymentMethod,
  UserRole,
  ReferralUrgency,
} from '@/lib/types';

const appointmentStatusTone: Record<AppointmentStatus, StatusTone> = {
  PENDING: 'warning',
  PENDING_IN_PERSON: 'warning',
  CONFIRMED: 'info',
  CONFIRMED_IN_PERSON: 'info',
  CONFIRMED_TELEMEDICINE: 'primary',
  ARRIVED: 'info',
  IN_CONSULTATION: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  CANCELLED_NO_SHOW: 'danger',
  NO_SHOW: 'danger',
};

const paymentStatusTone: Record<PaymentStatus, StatusTone> = {
  UNPAID: 'danger',
  PAID: 'success',
  VOID: 'neutral',
};

const roleTone: Record<UserRole, StatusTone> = {
  ADMIN: 'warning',
  DOCTOR: 'info',
  PATIENT: 'primary',
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const labels: Partial<Record<AppointmentStatus, string>> = {
    CANCELLED_NO_SHOW: 'No show',
    PENDING_IN_PERSON: 'Pending in person',
    CONFIRMED_IN_PERSON: 'Confirmed in person',
    CONFIRMED_TELEMEDICINE: 'Confirmed telemedicine',
  };
  return (
    <StatusBadge
      tone={appointmentStatusTone[status]}
      label={labels[status] ?? status.replace(/_/g, ' ').toLowerCase()}
      className="capitalize"
    />
  );
}

export function AppointmentTypeBadge({ type }: { type: AppointmentType }) {
  return (
    <StatusBadge
      tone={type === 'TELEMEDICINE' ? 'primary' : 'info'}
      label={type === 'TELEMEDICINE' ? 'Telemedicine' : 'In person'}
    />
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <StatusBadge
      tone={paymentStatusTone[status]}
      label={status.toLowerCase()}
      className="uppercase tracking-wide"
    />
  );
}

export function PaymentMethodBadge({ method }: { method: PaymentMethod | null }) {
  if (!method) return <span className="text-muted-foreground">—</span>;
  return <StatusBadge tone="neutral" label={method.replace(/_/g, ' ').toLowerCase()} />;
}

export function RoleBadge({ role }: { role: UserRole }) {
  const labels: Record<UserRole, string> = {
    ADMIN: 'Reception',
    DOCTOR: 'Doctor',
    PATIENT: 'Patient',
  };
  return <StatusBadge tone={roleTone[role]} label={labels[role]} />;
}

export function ReferralUrgencyBadge({ urgency }: { urgency: ReferralUrgency }) {
  return (
    <StatusBadge
      tone={urgency === 'URGENT' ? 'danger' : 'info'}
      label={urgency.toLowerCase()}
    />
  );
}
