import { Resend } from 'resend';
import { SubscriptionPlan } from '@prisma/client';
import { env } from '../config/env';
import { isResendSendEnabled } from '../config/resendDelivery';
import { getPlanDefaults } from '../config/subscriptionPlans';
import { escapeHtml } from '../utils/escapeHtml';
import { practiceFrontendUrl } from '../utils/frontendUrl';

export { practiceFrontendUrl } from '../utils/frontendUrl';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

export interface InquiryEmailData {
  fullName: string;
  email: string;
  phone: string;
  practiceName?: string | null;
  hpcsaNumber: string;
  province?: string | null;
  city: string;
  practiceType?: string | null;
  requestedSubscriptionPlan?: SubscriptionPlan | null;
  referralSource?: string | null;
  message?: string | null;
  inquiryId: string;
}

function practiceTypeLabel(type: string): string {
  switch (type) {
    case 'SOLO':
      return 'Solo Practice';
    case 'SMALL_CLINIC':
      return 'Small Clinic (2–5 doctors)';
    case 'LARGE_CLINIC':
      return 'Large Clinic (6+ doctors)';
    default:
      return type;
  }
}

function requestedPlanLabel(plan: SubscriptionPlan): string {
  const defaults = getPlanDefaults(plan);
  return `${defaults.label} (${defaults.description})`;
}

export async function sendInquiryNotificationEmail(data: InquiryEmailData): Promise<void> {
  const client = getResend();
  if (!client || !isResendSendEnabled()) {
    console.warn('[email] Resend not sending — skipping inquiry email');
    return;
  }

  const dashboardUrl = `${env.FRONTEND_URL}/super-admin/inquiries`;
  const practiceLabel = data.practiceName || 'New practice inquiry';
  const planLine = data.requestedSubscriptionPlan
    ? requestedPlanLabel(data.requestedSubscriptionPlan)
    : data.practiceType
      ? practiceTypeLabel(data.practiceType)
      : 'Plan not selected';
  const locationLine = data.province ? `${data.city}, ${data.province}` : data.city;

  const safeName = escapeHtml(data.fullName);
  const safeEmail = escapeHtml(data.email);
  const safePhone = escapeHtml(data.phone);
  const safeHpcsa = escapeHtml(data.hpcsaNumber);
  const safeCity = escapeHtml(locationLine);
  const safePractice = escapeHtml(practiceLabel);
  const safePlan = escapeHtml(planLine);
  const safeReferral = data.referralSource ? escapeHtml(data.referralSource) : null;
  const safeMessage = data.message ? escapeHtml(data.message) : null;

  const text = `New doctor wants to join MedSpace:

Name: ${data.fullName}
Email: ${data.email}
Phone: ${data.phone}
HPCSA: ${data.hpcsaNumber}
Interested plan: ${planLine}
Location: ${locationLine}
Practice name: ${practiceLabel}
${data.referralSource ? `Referral: ${data.referralSource}\n` : ''}${data.message ? `Message: "${data.message}"\n` : ''}
Action Required:
1. Verify HPCSA registration: https://hpcsa.co.za/verify
2. Call to discuss requirements
3. Create practice portal in Super Admin
4. Send owner invitation

View in Dashboard: ${dashboardUrl}`;

  const html = `
    <h2>New Practice Inquiry: ${safeName} (${safeCity})</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td><strong>Name</strong></td><td>${safeName}</td></tr>
      <tr><td><strong>Email</strong></td><td>${safeEmail}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${safePhone}</td></tr>
      <tr><td><strong>HPCSA</strong></td><td>${safeHpcsa}</td></tr>
      <tr><td><strong>Interested plan</strong></td><td>${safePlan}</td></tr>
      <tr><td><strong>Location</strong></td><td>${safeCity}</td></tr>
      <tr><td><strong>Practice</strong></td><td>${safePractice}</td></tr>
      ${safeReferral ? `<tr><td><strong>Referral</strong></td><td>${safeReferral}</td></tr>` : ''}
      ${safeMessage ? `<tr><td><strong>Message</strong></td><td>${safeMessage}</td></tr>` : ''}
    </table>
    <h3>Action Required</h3>
    <ol>
      <li>Verify HPCSA registration: <a href="https://hpcsa.co.za/verify">hpcsa.co.za/verify</a></li>
      <li>Call to discuss requirements</li>
      <li>Create practice portal in Super Admin</li>
      <li>Send owner invitation</li>
    </ol>
    <p><a href="${escapeHtml(dashboardUrl)}">View in Dashboard</a></p>
  `;

  const result = await client.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: env.INQUIRY_NOTIFICATION_EMAIL,
    subject: `New Practice Inquiry: ${data.fullName} (${data.city})`,
    text,
    html,
  });
  if (result.error) {
    console.warn('[email] inquiry delivery failed:', result.error.message);
  }
}

function roleLabel(role: string, isOwner: boolean): string {
  if (isOwner) return 'Practice Owner';
  if (role === 'ADMIN') return 'Reception';
  if (role === 'DOCTOR') return 'Doctor';
  return role;
}

async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  logTag: string;
}): Promise<boolean> {
  const client = getResend();
  if (!client || !isResendSendEnabled()) {
    console.log(`[${params.logTag}] Resend not sending — email skipped`, {
      to: params.to,
      subject: params.subject,
    });
    return false;
  }
  const result = await client.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
  if (result.error) {
    console.warn(`[${params.logTag}] Resend delivery failed: ${result.error.message}`);
    return false;
  }
  return true;
}

export async function sendPracticeInvitationEmail(data: {
  email: string;
  fullName: string;
  practiceName: string;
  subdomain: string;
  role: string;
  isPracticeOwner: boolean;
  token: string;
  isResend?: boolean;
}): Promise<boolean> {
  const inviteUrl = practiceFrontendUrl(data.subdomain, `/invite?token=${encodeURIComponent(data.token)}`);
  const label = roleLabel(data.role, data.isPracticeOwner);
  const safeName = escapeHtml(data.fullName);
  const safePractice = escapeHtml(data.practiceName);
  const safeRole = escapeHtml(label);
  const subject = data.isResend
    ? `Your MedSpace invitation was resent — ${data.practiceName}`
    : `You're invited to ${data.practiceName} on MedSpace`;

  const text = `Hi ${data.fullName},

${data.isResend ? 'Here is a new invitation link' : 'You have been invited'} to join ${data.practiceName} on MedSpace as ${label}.

Activate your account and create your own password:
${inviteUrl}

This link expires in 7 days and can only be used once.

MedSpace will never email you a password.

— MedSpace Team`;

  const html = `
    <p>Hi ${safeName},</p>
    <p>${data.isResend ? 'Here is a new invitation link' : 'You have been invited'} to join <strong>${safePractice}</strong> on MedSpace as <strong>${safeRole}</strong>.</p>
    <p><a href="${escapeHtml(inviteUrl)}">Activate your account and create your password</a></p>
    <p>This link expires in 7 days and can only be used once.</p>
    <p>MedSpace will never email you a password.</p>
    <p>— MedSpace Team</p>
  `;

  return sendEmail({
    to: data.email,
    subject,
    text,
    html,
    logTag: 'invitation-email',
  });
}

export async function sendPatientActivationEmail(data: {
  email: string;
  fullName: string;
  practiceName: string;
  subdomain: string;
  token: string;
  isResend?: boolean;
}): Promise<boolean> {
  const activateUrl = practiceFrontendUrl(
    data.subdomain,
    `/activate?token=${encodeURIComponent(data.token)}`
  );
  const safeName = escapeHtml(data.fullName);
  const safePractice = escapeHtml(data.practiceName);
  const subject = data.isResend
    ? `Your MedSpace portal invitation was resent — ${data.practiceName}`
    : `${data.practiceName} has invited you to activate your MedSpace patient portal`;

  const text = `Hi ${data.fullName},

${data.practiceName} has created your patient profile on MedSpace.
Activate your secure patient portal to manage your appointments and access the services available from your practice.

${activateUrl}

This link expires in 7 days and can only be used once.

MedSpace will never email you a password.

— MedSpace Team`;

  const html = `
    <p>Hi ${safeName},</p>
    <p><strong>${safePractice}</strong> has created your patient profile on MedSpace. Activate your secure patient portal to manage your appointments and access the services available from your practice.</p>
    <p><a href="${escapeHtml(activateUrl)}">Activate Patient Portal</a></p>
    <p>This link expires in 7 days and can only be used once.</p>
    <p>MedSpace will never email you a password.</p>
    <p>— MedSpace Team</p>
  `;

  return sendEmail({
    to: data.email,
    subject,
    text,
    html,
    logTag: 'patient-activation-email',
  });
}

export async function sendPasswordResetEmail(data: {
  email: string;
  fullName: string;
  subdomain: string;
  token: string;
}): Promise<boolean> {
  const resetUrl = practiceFrontendUrl(
    data.subdomain,
    `/reset-password?token=${encodeURIComponent(data.token)}`
  );
  const safeName = escapeHtml(data.fullName);

  return sendEmail({
    to: data.email,
    subject: 'Reset your MedSpace password',
    text: `Hi ${data.fullName},

We received a request to reset your MedSpace password.

${resetUrl}

This link expires in 1 hour. If you did not request a reset, you can ignore this email.

— MedSpace Team`,
    html: `
      <p>Hi ${safeName},</p>
      <p>We received a request to reset your MedSpace password.</p>
      <p><a href="${escapeHtml(resetUrl)}">Create a new password</a></p>
      <p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>
      <p>— MedSpace Team</p>
    `,
    logTag: 'password-reset-email',
  });
}

export async function sendPaymentReportedEmail(data: {
  email: string;
  fullName: string;
  practiceName: string;
  invoiceNumber: string;
  amountCents: number;
  paymentReference: string;
}): Promise<boolean> {
  const amount = `R${(data.amountCents / 100).toFixed(2)}`;
  return sendEmail({
    to: data.email,
    subject: `Payment reported for ${data.invoiceNumber}`,
    text: `Hi ${data.fullName},

We received your EFT payment report for ${data.practiceName}.

Invoice: ${data.invoiceNumber}
Amount: ${amount}
Reference: ${data.paymentReference}

MedSpace will verify this payment. Your invoice will remain Payment reported until a Super Admin confirms it.

— MedSpace Team`,
    html: `
      <p>Hi ${escapeHtml(data.fullName)},</p>
      <p>We received your EFT payment report for <strong>${escapeHtml(data.practiceName)}</strong>.</p>
      <p>Invoice: ${escapeHtml(data.invoiceNumber)}<br/>Amount: ${escapeHtml(amount)}<br/>Reference: ${escapeHtml(data.paymentReference)}</p>
      <p>MedSpace will verify this payment. Your invoice will remain <strong>Payment reported</strong> until a Super Admin confirms it.</p>
      <p>— MedSpace Team</p>
    `,
    logTag: 'payment-reported-email',
  });
}

export async function sendPaymentVerifiedEmail(data: {
  email: string;
  fullName: string;
  practiceName: string;
  invoiceNumber: string;
  amountCents: number;
}): Promise<boolean> {
  const amount = `R${(data.amountCents / 100).toFixed(2)}`;
  return sendEmail({
    to: data.email,
    subject: `Payment verified for ${data.invoiceNumber}`,
    text: `Hi ${data.fullName},

Your subscription payment for ${data.practiceName} has been verified.

Invoice: ${data.invoiceNumber}
Amount: ${amount}
Status: Paid

— MedSpace Team`,
    html: `
      <p>Hi ${escapeHtml(data.fullName)},</p>
      <p>Your subscription payment for <strong>${escapeHtml(data.practiceName)}</strong> has been verified.</p>
      <p>Invoice: ${escapeHtml(data.invoiceNumber)}<br/>Amount: ${escapeHtml(amount)}<br/>Status: <strong>Paid</strong></p>
      <p>— MedSpace Team</p>
    `,
    logTag: 'payment-verified-email',
  });
}

export async function sendSubscriptionInvoiceCreatedEmail(data: {
  email: string;
  fullName: string;
  practiceName: string;
  invoiceNumber: string;
  amountCents: number;
  dueAt: Date;
  billingUrl: string;
}): Promise<boolean> {
  const amount = `R${(data.amountCents / 100).toFixed(2)}`;
  const due = data.dueAt.toISOString().slice(0, 10);
  return sendEmail({
    to: data.email,
    subject: `New subscription invoice ${data.invoiceNumber}`,
    text: `Hi ${data.fullName},

A new MedSpace subscription invoice is ready for ${data.practiceName}.

Invoice: ${data.invoiceNumber}
Amount: ${amount}
Due: ${due}

View and report payment:
${data.billingUrl}

— MedSpace Team`,
    html: `
      <p>Hi ${escapeHtml(data.fullName)},</p>
      <p>A new MedSpace subscription invoice is ready for <strong>${escapeHtml(data.practiceName)}</strong>.</p>
      <p>Invoice: ${escapeHtml(data.invoiceNumber)}<br/>Amount: ${escapeHtml(amount)}<br/>Due: ${escapeHtml(due)}</p>
      <p><a href="${escapeHtml(data.billingUrl)}">Open Subscription &amp; Billing</a></p>
      <p>— MedSpace Team</p>
    `,
    logTag: 'subscription-invoice-created-email',
  });
}
