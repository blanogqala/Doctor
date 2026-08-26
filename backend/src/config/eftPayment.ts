import { env } from '../config/env';
import { practiceFrontendUrl } from '../utils/frontendUrl';

export interface EftPaymentInstructions {
  accountHolder: string;
  bank: string;
  accountNumber: string;
  branchCode: string;
  referenceGuidance: string;
}

/**
 * Optional EFT instructions for Owner Subscription & Billing.
 * Only returned when required env vars are configured — never invent bank details.
 */
export function getEftPaymentInstructions(): EftPaymentInstructions | null {
  const accountHolder = process.env.EFT_ACCOUNT_HOLDER?.trim();
  const bank = process.env.EFT_BANK?.trim();
  const accountNumber = process.env.EFT_ACCOUNT_NUMBER?.trim();
  const branchCode = process.env.EFT_BRANCH_CODE?.trim();
  if (!accountHolder || !bank || !accountNumber || !branchCode) {
    return null;
  }
  return {
    accountHolder,
    bank,
    accountNumber,
    branchCode,
    referenceGuidance:
      process.env.EFT_REFERENCE_GUIDANCE?.trim() ||
      'Use your invoice number as the payment reference.',
  };
}

/** Tenant-aware Practice Owner billing URL (no secrets/tokens). */
export function ownerBillingUrl(subdomain?: string | null): string {
  if (subdomain?.trim()) {
    return practiceFrontendUrl(subdomain.trim(), '/doctor/practice-management');
  }
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  return `${base}/doctor/practice-management`;
}
