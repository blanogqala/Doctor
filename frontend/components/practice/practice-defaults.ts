import {
  Stethoscope,
  Video,
  Heart,
  Users,
  FileText,
  Activity,
  Baby,
  Bone,
  Brain,
  Pill,
  type LucideIcon,
} from 'lucide-react';

export const SERVICE_ICON_OPTIONS: Array<{ value: string; label: string; icon: LucideIcon }> = [
  { value: 'stethoscope', label: 'Stethoscope', icon: Stethoscope },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'heart', label: 'Heart', icon: Heart },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'file-text', label: 'Document', icon: FileText },
  { value: 'activity', label: 'Activity', icon: Activity },
  { value: 'baby', label: 'Baby', icon: Baby },
  { value: 'bone', label: 'Bone', icon: Bone },
  { value: 'brain', label: 'Brain', icon: Brain },
  { value: 'pill', label: 'Pill', icon: Pill },
];

const SERVICE_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  SERVICE_ICON_OPTIONS.map((opt) => [opt.value, opt.icon])
);

export function serviceIcon(key: string | undefined): LucideIcon {
  return (key && SERVICE_ICON_MAP[key]) || Stethoscope;
}

export interface PracticeService {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface LandingServiceItem {
  title: string;
  description: string;
  icon: string;
}

export const DEFAULT_LANDING_SERVICES: LandingServiceItem[] = [
  {
    title: 'General Consultations',
    description: 'Routine check-ups, illness diagnosis, and prescriptions.',
    icon: 'stethoscope',
  },
  {
    title: 'Telemedicine',
    description: 'Video consultations from the comfort of your home.',
    icon: 'video',
  },
  {
    title: 'Chronic Care',
    description: 'Diabetes, hypertension, and asthma management.',
    icon: 'heart',
  },
  {
    title: 'Family Planning',
    description: 'Contraception advice and reproductive health support.',
    icon: 'users',
  },
  {
    title: 'Medical Certificates',
    description: 'Sick notes and fitness-to-work certificates.',
    icon: 'file-text',
  },
  {
    title: 'Health Screening',
    description: 'Blood pressure, glucose, and cholesterol testing.',
    icon: 'activity',
  },
];

export const DEFAULT_SERVICES: PracticeService[] = DEFAULT_LANDING_SERVICES.map((s) => ({
  title: s.title,
  description: s.description,
  icon: serviceIcon(s.icon),
}));

export const DEFAULT_SERVICES_INTRO =
  'Comprehensive primary care for you and your family.';

export function parseLandingServices(value: unknown): LandingServiceItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items: LandingServiceItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!title) continue;
    items.push({
      title,
      description: typeof row.description === 'string' ? row.description : '',
      icon: typeof row.icon === 'string' ? row.icon : 'stethoscope',
    });
  }
  return items.length ? items : null;
}

export interface PracticeTestimonial {
  quote: string;
  name: string;
  location: string;
}

export const DEFAULT_TESTIMONIALS: PracticeTestimonial[] = [
  {
    quote:
      'Dr. Ndamase is incredibly patient and thorough. I was able to book online and get my prescription the same day.',
    name: 'Thabo M.',
    location: 'Port Elizabeth',
  },
  {
    quote: 'The telemedicine option saved me a 2-hour drive. Highly recommend!',
    name: 'Lindiwe D.',
    location: 'Uitenhage',
  },
  {
    quote:
      'Finally a doctor who explains everything in isiXhosa. My whole family comes here now.',
    name: 'Nomsa K.',
    location: 'Motherwell',
  },
];

export interface PracticeFaqItem {
  question: string;
  answer: string;
}

export function buildDefaultFaqs(emergencyPhone?: string | null): PracticeFaqItem[] {
  const emergency = emergencyPhone || 'your nearest hospital emergency line';
  return [
    {
      question: 'How do I book an appointment?',
      answer:
        'Click "Book Now" and create an account or sign in. Select your preferred time and you will receive an SMS confirmation.',
    },
    {
      question: 'Can I get a prescription via telemedicine?',
      answer:
        'Yes, if clinically appropriate. Prescriptions can be sent to your pharmacy or emailed to you.',
    },
    {
      question: 'What should I bring to my first visit?',
      answer: 'ID, medical aid card, and a list of your current medications.',
    },
    {
      question: 'Do you offer after-hours emergencies?',
      answer: `For emergencies, please call ${emergency} or visit the nearest hospital. For non-urgent issues, book the next available slot.`,
    },
    {
      question: 'Is my data secure?',
      answer:
        'Your health information is protected with role-based access controls, encrypted connections, and tenant-isolated clinical data.',
    },
  ];
}

export function phoneToTelHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

export function phoneToWhatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `27${digits.slice(1)}`;
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function formatSlotLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startOfSlotDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (startOfSlotDay.getTime() === startOfToday.getTime()) return `Today at ${time}`;
  if (startOfSlotDay.getTime() === startOfTomorrow.getTime()) return `Tomorrow at ${time}`;
  const day = d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} at ${time}`;
}
