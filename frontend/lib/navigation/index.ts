import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  CreditCard,
  ScrollText,
  Settings,
  FileText,
  Video,
  MessageSquare,
  Building2,
  LifeBuoy,
  Inbox,
  UserRound,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const receptionNavigation: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/appointments', label: 'Appointments', icon: CalendarDays },
  { href: '/admin/patients', label: 'Patients', icon: Users },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export const doctorNavigation: NavItem[] = [
  { href: '/doctor', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/doctor/queue', label: 'Patient Queue', icon: Users },
  { href: '/doctor/records', label: 'Patient Folders', icon: FileText },
  { href: '/doctor/telemedicine', label: 'Telemedicine', icon: Video },
  { href: '/doctor/messages', label: 'Messages', icon: MessageSquare },
];

export function doctorNavItems(isPracticeOwner: boolean): NavItem[] {
  const items = [...doctorNavigation];
  if (isPracticeOwner) {
    items.push({ href: '/doctor/practice-management', label: 'Practice Management', icon: Building2 });
  }
  items.push({ href: '/doctor/profile', label: 'My profile', icon: UserRound });
  return items;
}

export const patientNavigation: NavItem[] = [
  { href: '/patient', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patient/book', label: 'Book Appointment', icon: CalendarDays },
  { href: '/patient/records', label: 'My Records', icon: FileText },
  { href: '/patient/telemedicine', label: 'Telemedicine', icon: Video },
  { href: '/patient/messages', label: 'Messages', icon: MessageSquare },
  { href: '/patient/payments', label: 'Payments', icon: CreditCard },
];

export const platformAdminNavigation: NavItem[] = [
  { href: '/super-admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/super-admin/inquiries', label: 'Inquiries', icon: Inbox },
  { href: '/super-admin/practices', label: 'Practices', icon: Building2 },
  { href: '/super-admin/billing', label: 'Billing', icon: CreditCard },
  { href: '/super-admin/support', label: 'Support', icon: LifeBuoy },
];

export const MESSAGES_HREFS = new Set([
  '/admin/messages',
  '/doctor/messages',
  '/patient/messages',
]);

export function isNavItemActive(pathname: string, href: string, roleBasePath?: string): boolean {
  if (pathname === href) return true;
  if (roleBasePath && href === roleBasePath) return false;
  return pathname.startsWith(`${href}/`);
}
