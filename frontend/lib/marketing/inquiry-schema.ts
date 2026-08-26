import { z } from 'zod';
import { SA_PROVINCES, REFERRAL_SOURCES } from './constants';

const subscriptionPlanValues = ['SOLO', 'SMALL_PRACTICE', 'CLINIC', 'ENTERPRISE'] as const;

export const inquirySchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().min(10, 'Enter a valid phone number'),
  practice_name: z.string().optional(),
  hpcsa_number: z
    .string()
    .regex(/^MP\d{6,7}$/i, 'HPCSA number must be in format MP1234567'),
  province: z.enum(SA_PROVINCES as unknown as [string, ...string[]], {
    required_error: 'Select your province',
  }),
  city: z.string().min(2, 'Enter your city or town'),
  requested_subscription_plan: z.enum(subscriptionPlanValues, {
    required_error: 'Select your preferred plan',
  }),
  referral_source: z
    .enum(REFERRAL_SOURCES as unknown as [string, ...string[]])
    .optional()
    .or(z.literal('')),
  message: z.string().optional(),
});

export type InquiryFormValues = z.infer<typeof inquirySchema>;

export const CONSUMER_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];

export function isConsumerEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? CONSUMER_EMAIL_DOMAINS.includes(domain) : false;
}
