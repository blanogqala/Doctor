import { InquiryStatus, PracticeType, Prisma, SubscriptionPlan } from '@prisma/client';
import { prisma } from '../config/database';
import { sendInquiryNotificationEmail } from './emailService';

export interface CreateInquiryInput {
  fullName: string;
  email: string;
  phone: string;
  practiceName?: string;
  hpcsaNumber: string;
  province: string;
  city: string;
  requestedSubscriptionPlan: SubscriptionPlan;
  practiceType?: PracticeType | null;
  referralSource?: string;
  message?: string;
}

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function checkInquiryRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

export async function createPracticeInquiry(input: CreateInquiryInput) {
  const inquiry = await prisma.practiceInquiry.create({
    data: {
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      phone: input.phone,
      practiceName: input.practiceName ?? null,
      hpcsaNumber: input.hpcsaNumber.toUpperCase(),
      province: input.province,
      city: input.city,
      practiceType: input.practiceType ?? null,
      requestedSubscriptionPlan: input.requestedSubscriptionPlan,
      referralSource: input.referralSource ?? null,
      message: input.message ?? null,
    },
  });

  const notificationData = {
    inquiryId: inquiry.id,
    doctorName: inquiry.fullName,
    email: inquiry.email,
    phone: inquiry.phone,
    hpcsaNumber: inquiry.hpcsaNumber,
    province: inquiry.province,
    city: inquiry.city,
    practiceType: inquiry.practiceType,
    requestedSubscriptionPlan: inquiry.requestedSubscriptionPlan,
    submittedAt: inquiry.createdAt.toISOString(),
  };

  await prisma.superAdminNotification.create({
    data: {
      type: 'NEW_PRACTICE_INQUIRY',
      data: notificationData as Prisma.InputJsonValue,
    },
  });

  try {
    await sendInquiryNotificationEmail({
      fullName: inquiry.fullName,
      email: inquiry.email,
      phone: inquiry.phone,
      practiceName: inquiry.practiceName,
      hpcsaNumber: inquiry.hpcsaNumber,
      province: inquiry.province,
      city: inquiry.city,
      practiceType: inquiry.practiceType,
      requestedSubscriptionPlan: inquiry.requestedSubscriptionPlan,
      referralSource: inquiry.referralSource,
      message: inquiry.message,
      inquiryId: inquiry.id,
    });
  } catch (err) {
    console.error('[inquiry] Failed to send email notification:', err);
  }

  return inquiry;
}

export async function listInquiries(options?: { status?: InquiryStatus; limit?: number }) {
  return prisma.practiceInquiry.findMany({
    where: options?.status ? { status: options.status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: options?.limit,
  });
}

export async function getInquiryById(id: string) {
  return prisma.practiceInquiry.findUnique({ where: { id } });
}

export async function updateInquiryStatus(id: string, status: InquiryStatus) {
  return prisma.practiceInquiry.update({
    where: { id },
    data: { status },
  });
}

export async function countNewInquiries() {
  return prisma.practiceInquiry.count({ where: { status: InquiryStatus.NEW } });
}

export async function listNotifications(options?: { unreadOnly?: boolean; limit?: number }) {
  return prisma.superAdminNotification.findMany({
    where: options?.unreadOnly ? { read: false } : undefined,
    orderBy: { createdAt: 'desc' },
    take: options?.limit,
  });
}

export async function countUnreadNotifications() {
  return prisma.superAdminNotification.count({ where: { read: false } });
}

export async function markNotificationRead(id: string) {
  return prisma.superAdminNotification.update({
    where: { id },
    data: { read: true },
  });
}
