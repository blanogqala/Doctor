import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toSnakeCase } from '../utils/serialize';
import { normalizeSubdomain } from '../middleware/tenant';
import { checkInquiryRateLimit, createPracticeInquiry } from '../services/inquiryService';
import { generateSlots, toDateOnlyString } from '../services/schedulingService';
import { activeDoctorWhere, assertActiveDoctorInPractice } from '../services/activeDoctor';
import {
  getPracticeLogoStorage,
  isLogoKeyOwnedByPractice,
  mimeForLogoFilename,
  parseStoredPracticeLogo,
  publicApiOriginFromRequest,
  resolvePublicPracticeLogoUrl,
} from '../services/practiceLogoStorage';
import path from 'path';

const router = Router();

function parseCredentials(value: Prisma.JsonValue | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

router.get(
  '/practice-logos/:practiceId/:filename',
  asyncHandler(async (req: Request, res: Response) => {
    const practiceId = String(req.params.practiceId || '');
    const filename = path.basename(String(req.params.filename || ''));
    const key = `practice/${practiceId}/logos/${filename}`;
    if (!practiceId || !filename || !isLogoKeyOwnedByPractice(key, practiceId)) {
      throw new AppError(404, 'Logo not found');
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId, softDeletedAt: null },
      select: { id: true, logoUrl: true },
    });
    if (!practice) throw new AppError(404, 'Logo not found');

    const parsed = parseStoredPracticeLogo(practice.logoUrl);
    if (!parsed || parsed.kind !== 'key' || parsed.key !== key || parsed.practiceId !== practiceId) {
      throw new AppError(404, 'Logo not found');
    }

    const storage = getPracticeLogoStorage();
    if (!(await storage.exists(key))) throw new AppError(404, 'Logo not found');

    res.setHeader('Content-Type', mimeForLogoFilename(filename));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const stream = await storage.openReadStream(key);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).end();
      else res.end();
    });
    stream.pipe(res);
  })
);

/** Public online booking is available for ACTIVE and valid (non-expired) TRIAL only. */
export function isPublicBookingAvailable(practice: {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  now?: Date;
}): boolean {
  const now = practice.now ?? new Date();
  if (practice.subscriptionStatus === SubscriptionStatus.ACTIVE) return true;
  if (practice.subscriptionStatus === SubscriptionStatus.TRIAL) {
    if (!practice.trialEndsAt) return true;
    return now.getTime() <= practice.trialEndsAt.getTime();
  }
  return false;
}

router.get(
  '/practice-info',
  asyncHandler(async (req: Request, res: Response) => {
    const fromQuery = req.query.subdomain ? normalizeSubdomain(String(req.query.subdomain)) : null;
    const subdomain = fromQuery || req.practiceContext?.subdomain;
    if (!subdomain) {
      throw new AppError(400, 'subdomain is required');
    }

    const practice = await prisma.practice.findFirst({
      where: { subdomain, softDeletedAt: null },
      include: {
        doctors: {
          where: activeDoctorWhere(),
          include: { profile: { select: { id: true, fullName: true, email: true } } },
          orderBy: { practiceName: 'asc' },
        },
      },
    });

    if (!practice) {
      throw new AppError(404, 'Practice not found');
    }

    const bookingAvailable = isPublicBookingAvailable(practice);
    const logoUrl = await resolvePublicPracticeLogoUrl({
      stored: practice.logoUrl,
      practiceId: practice.id,
      publicApiOrigin: publicApiOriginFromRequest(req),
    });

    res.json(
      toSnakeCase({
        id: practice.id,
        subdomain: practice.subdomain,
        clinicName: practice.clinicName,
        logoUrl,
        brandColor: practice.brandColor,
        tagline: practice.tagline,
        phone: practice.phone,
        email: practice.email,
        whatsapp: practice.whatsapp,
        addressLine1: practice.addressLine1,
        city: practice.city,
        province: practice.province,
        postalCode: practice.postalCode,
        mapEmbedUrl: practice.mapEmbedUrl,
        emergencyPhone: practice.emergencyPhone,
        officeHours: practice.officeHours,
        landingServices: practice.landingServices,
        servicesIntro: practice.servicesIntro,
        subscriptionStatus: practice.subscriptionStatus,
        trialEndsAt: practice.trialEndsAt,
        bookingAvailable,
        doctors: practice.doctors.map((d) => ({
          id: d.id,
          fullName: d.profile.fullName,
          specialization: d.specialization,
          consultationFeeCents: d.consultationFeeCents,
          telemedicineFeeCents: d.telemedicineFeeCents,
          bio: d.bio,
          photoUrl: d.photoUrl,
          credentials: parseCredentials(d.credentials),
          hpcsaRegistrationNumber: d.hpcsaRegistrationNumber,
          isVerified: d.isVerified,
        })),
      })
    );
  })
);

router.get(
  '/next-slots',
  asyncHandler(async (req: Request, res: Response) => {
    const fromQuery = req.query.subdomain ? normalizeSubdomain(String(req.query.subdomain)) : null;
    const subdomain = fromQuery || req.practiceContext?.subdomain;
    if (!subdomain) {
      throw new AppError(400, 'subdomain is required');
    }

    const doctorId = String(req.query.doctor_id || '');
    if (!doctorId) {
      throw new AppError(400, 'doctor_id is required');
    }

    const limitRaw = Number(req.query.limit ?? 3);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 10) : 3;
    const daysToScan = 14;

    const practice = await prisma.practice.findFirst({
      where: { subdomain, softDeletedAt: null },
      select: { id: true, subscriptionStatus: true, trialEndsAt: true },
    });
    if (!practice) {
      throw new AppError(404, 'Practice not found');
    }

    if (!isPublicBookingAvailable(practice)) {
      return res.json({
        slots: [],
        booking_available: false,
        message:
          'Online booking is temporarily unavailable. Please contact the Practice directly.',
      });
    }

    try {
      await assertActiveDoctorInPractice(prisma, doctorId, practice.id);
    } catch {
      throw new AppError(404, 'Doctor not found for this practice');
    }

    const slots: Array<{ start: string; end: string }> = [];
    const today = new Date();

    for (let i = 0; i < daysToScan && slots.length < limit; i++) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const dateStr = toDateOnlyString(day);
      const daySlots = await generateSlots({ doctorId, date: dateStr });
      for (const slot of daySlots) {
        slots.push(slot);
        if (slots.length >= limit) break;
      }
    }

    res.json({ slots, booking_available: true });
  })
);

const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const;

const inquirySchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  practice_name: z.string().optional(),
  hpcsa_number: z.string().regex(/^MP\d{6,7}$/i),
  province: z.enum(SA_PROVINCES),
  city: z.string().min(2).max(120),
  requested_subscription_plan: z.nativeEnum(SubscriptionPlan),
  referral_source: z.string().optional(),
  message: z.string().optional(),
});

router.post(
  '/inquiry',
  asyncHandler(async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkInquiryRateLimit(ip)) {
      throw new AppError(429, 'Too many submissions. Please try again later.');
    }

    const body = inquirySchema.parse(req.body);

    const inquiry = await createPracticeInquiry({
      fullName: body.full_name,
      email: body.email,
      phone: body.phone,
      practiceName: body.practice_name,
      hpcsaNumber: body.hpcsa_number,
      province: body.province,
      city: body.city,
      requestedSubscriptionPlan: body.requested_subscription_plan,
      referralSource: body.referral_source,
      message: body.message,
    });

    res.status(201).json({ success: true, id: inquiry.id });
  })
);

export default router;
