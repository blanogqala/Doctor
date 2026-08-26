import { getApiBaseUrl } from '@/lib/api';
import type { InquiryFormValues } from '@/lib/marketing/inquiry-schema';

export class PublicApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

export async function submitInquiry(data: InquiryFormValues): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${getApiBaseUrl()}/api/public/inquiry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      hpcsa_number: data.hpcsa_number.toUpperCase(),
      province: data.province,
      city: data.city,
      requested_subscription_plan: data.requested_subscription_plan,
      referral_source: data.referral_source || undefined,
      practice_name: data.practice_name || undefined,
      message: data.message || undefined,
    }),
  });

  if (!res.ok) {
    let message = 'Failed to submit inquiry';
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      // ignore
    }
    throw new PublicApiError(message, res.status);
  }

  return res.json();
}
