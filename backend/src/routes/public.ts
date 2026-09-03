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
import {
  isDoctorPhotoKeyOwned,
  parseStoredDoctorPhoto,
  resolvePublicDoctorPhotoUrl,
} from '../services/practiceDoctorPhotoStorage';
import { getPracticeMediaStorage, mimeForMediaFilename } from '../services/practiceMediaStorage';
import { isPracticeAccessFull } from '../services/practiceAccessPolicy';
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

/**
 * Durable public doctor photos. Only the exact object currently referenced by a
 * live Doctor inside the requested Practice is streamable — the storage root is
 * never browsable.
 */
router.get(
  '/practice-doctor-photos/:practiceId/:doctorId/:filename',
  asyncHandler(async (req: Request, res: Response) => {
    const practiceId = String(req.params.practiceId || '');
    const doctorId = String(req.params.doctorId || '');
    const filename = path.basename(String(req.params.filename || ''));
    const key = `practice/${practiceId}/doctors/${doctorId}/${filename}`;
    if (
      !practiceId ||
      !doctorId ||
      !filename ||
      !isDoctorPhotoKeyOwned(key, practiceId, doctorId)
    ) {
      throw new AppError(404, 'Photo not found');
    }

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId, softDeletedAt: null },
      select: { id: true },
    });
    if (!practice) throw new AppError(404, 'Photo not found');

    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, practiceId },
      select: { id: true, photoUrl: true },
    });
    if (!doctor) throw new AppError(404, 'Photo not found');

    const parsed = parseStoredDoctorPhoto(doctor.photoUrl);
    if (
      !parsed ||
      parsed.kind !== 'key' ||
      parsed.key !== key ||
      parsed.practiceId !== practiceId ||
      parsed.doctorId !== doctorId
    ) {
      throw new AppError(404, 'Photo not found');
    }

    const storage = getPracticeMediaStorage();
    if (!(await storage.exists(key))) throw new AppError(404, 'Photo not found');

    res.setHeader('Content-Type', mimeForMediaFilename(filename));
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

/** Public online booking is available only when derived Practice access is FULL. */
export function isPublicBookingAvailable(practice: {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  ownerProfileId?: string | null;
  subscriptionSuspensionReason?: import('@prisma/client').SubscriptionSuspensionReason | null;
  subscriptionSuspendedAt?: Date | null;
  now?: Date;
}): boolean {
  const now = practice.now ?? new Date();
  return isPracticeAccessFull(
    {
      subscriptionStatus: practice.subscriptionStatus,
      trialEndsAt: practice.trialEndsAt,
      ownerProfileId: practice.ownerProfileId ?? null,
      subscriptionSuspensionReason: practice.subscriptionSuspensionReason ?? null,
      subscriptionSuspendedAt: practice.subscriptionSuspendedAt ?? null,
    },
    now
  );
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
    const publicApiOrigin = publicApiOriginFromRequest(req);
    const logoUrl = await resolvePublicPracticeLogoUrl({
      stored: practice.logoUrl,
      practiceId: practice.id,
      publicApiOrigin,
    });
    const doctorPhotoUrls = await Promise.all(
      practice.doctors.map((d) =>
        resolvePublicDoctorPhotoUrl({
          stored: d.photoUrl,
          practiceId: practice.id,
          doctorId: d.id,
          publicApiOrigin,
        })
      )
    );

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
        doctors: practice.doctors.map((d, i) => ({
          id: d.id,
          fullName: d.profile.fullName,
          specialization: d.specialization,
          consultationFeeCents: d.consultationFeeCents,
          telemedicineFeeCents: d.telemedicineFeeCents,
          bio: d.bio,
          photoUrl: doctorPhotoUrls[i],
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
