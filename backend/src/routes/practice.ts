import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireTenant, tenantWhere } from '../middleware/tenant';
import { toSnakeCase } from '../utils/serialize';
import { detectImageMimeFromBuffer } from '../utils/fileSignature';
import {
  legacyLogoFilePath,
  publicApiOriginFromRequest,
  resolvePublicPracticeLogoUrl,
} from '../services/practiceLogoStorage';
import {
  legacyDoctorPhotoFilePath,
  resolvePublicDoctorPhotoUrl,
} from '../services/practiceDoctorPhotoStorage';
import {
  commitDoctorPhotoReplacement,
  commitPracticeLogoReplacement,
} from '../services/practiceMediaReplacement';

const router = Router();

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Buffered upload — bytes only reach durable storage after authorization and magic-byte checks. */
function makeImageUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        cb(new AppError(400, 'Only PNG, JPEG, WebP, or GIF images are allowed'));
        return;
      }
      cb(null, true);
    },
  });
}

const logoUpload = makeImageUpload();
const photoUpload = makeImageUpload();

/** The declared MIME header is never trusted; the file signature decides. */
function detectAllowedImageMime(buffer: Buffer | undefined): string {
  const detectedMime = buffer ? detectImageMimeFromBuffer(buffer) : null;
  if (!detectedMime || !ALLOWED_IMAGE_MIME_TYPES.has(detectedMime)) {
    throw new AppError(400, 'Invalid image file. Only PNG, JPEG, WebP, or GIF images are allowed');
  }
  return detectedMime;
}

const officeHoursSchema = z
  .object({
    monFri: z.string().optional(),
    saturday: z.string().optional(),
    sunday: z.string().optional(),
  })
  .passthrough()
  .optional()
  .nullable();

router.get(
  '/logo-file/:filename',
  asyncHandler(async (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const filePath = legacyLogoFilePath(filename);
    if (!fs.existsSync(filePath)) throw new AppError(404, 'Logo not found');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(filePath);
  })
);

/** Legacy read-only route for photos stored before durable public media. */
router.get(
  '/doctor-photo/:filename',
  asyncHandler(async (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const filePath = legacyDoctorPhotoFilePath(filename);
    if (!fs.existsSync(filePath)) throw new AppError(404, 'Photo not found');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(filePath);
  })
);

router.use(requireTenant, authenticate);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new AppError(404, 'Practice not found');
    const logoUrl = await resolvePublicPracticeLogoUrl({
      stored: practice.logoUrl,
      practiceId: practice.id,
      publicApiOrigin: publicApiOriginFromRequest(req),
    });
    res.json(toSnakeCase({ ...practice, logoUrl }));
  })
);

const updateSchema = z.object({
  clinic_name: z.string().min(1).max(255).optional(),
  brand_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  tagline: z.string().max(500).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  whatsapp: z.string().max(40).optional().nullable(),
  address_line1: z.string().max(255).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  province: z.string().max(120).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  map_embed_url: z.string().max(1000).optional().nullable(),
  emergency_phone: z.string().max(40).optional().nullable(),
  office_hours: officeHoursSchema,
  services_intro: z.string().max(300).optional().nullable(),
  landing_services: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        description: z.string().max(500),
        icon: z.string().max(40),
      })
    )
    .max(12)
    .optional()
    .nullable(),
});

router.patch(
  '/',
  authorize(UserRole.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = updateSchema.parse(req.body);

    const data: Prisma.PracticeUpdateInput = {};
    if (body.clinic_name !== undefined) data.clinicName = body.clinic_name;
    if (body.brand_color !== undefined) data.brandColor = body.brand_color;
    if (body.tagline !== undefined) data.tagline = body.tagline;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.email !== undefined) data.email = body.email || null;
    if (body.whatsapp !== undefined) data.whatsapp = body.whatsapp;
    if (body.address_line1 !== undefined) data.addressLine1 = body.address_line1;
    if (body.city !== undefined) data.city = body.city;
    if (body.province !== undefined) data.province = body.province;
    if (body.postal_code !== undefined) data.postalCode = body.postal_code;
    if (body.map_embed_url !== undefined) data.mapEmbedUrl = body.map_embed_url;
    if (body.emergency_phone !== undefined) data.emergencyPhone = body.emergency_phone;
    if (body.office_hours !== undefined) {
      data.officeHours =
        body.office_hours === null
          ? Prisma.DbNull
          : (body.office_hours as Prisma.InputJsonValue);
    }
    if (body.services_intro !== undefined) data.servicesIntro = body.services_intro;
    if (body.landing_services !== undefined) {
      data.landingServices =
        body.landing_services === null
          ? Prisma.DbNull
          : (body.landing_services as Prisma.InputJsonValue);
    }

    const practice = await prisma.practice.update({
      where: { id: practiceId },
      data,
    });

    if (body.clinic_name) {
      await prisma.doctor.updateMany({
        where: { practiceId },
        data: { practiceName: body.clinic_name },
      });
    }

    const logoUrl = await resolvePublicPracticeLogoUrl({
      stored: practice.logoUrl,
      practiceId: practice.id,
      publicApiOrigin: publicApiOriginFromRequest(req),
    });
    res.json(toSnakeCase({ ...practice, logoUrl }));
  })
);

router.post(
  '/logo',
  authorize(UserRole.ADMIN),
  logoUpload.single('logo'),
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    if (!req.file?.buffer) throw new AppError(400, 'Logo file is required');
    const detectedMime = detectAllowedImageMime(req.file.buffer);

    const existing = await prisma.practice.findFirst({
      where: { id: practiceId, softDeletedAt: null },
      select: { id: true, logoUrl: true },
    });
    if (!existing) throw new AppError(404, 'Practice not found');

    const { publicUrl } = await commitPracticeLogoReplacement({
      practiceId,
      buffer: req.file.buffer,
      mime: detectedMime,
      previousStored: existing.logoUrl,
      publicApiOrigin: publicApiOriginFromRequest(req),
      updateDatabase: async (storageKey) => {
        await prisma.practice.update({
          where: { id: practiceId },
          data: { logoUrl: storageKey },
        });
      },
    });

    const practice = await prisma.practice.findFirst({
      where: { id: practiceId, softDeletedAt: null },
    });
    if (!practice) throw new AppError(404, 'Practice not found');
    res.json(toSnakeCase({ ...practice, logoUrl: publicUrl }));
  })
);

const doctorUpdateSchema = z.object({
  bio: z.string().max(5000).optional().nullable(),
  telemedicine_fee_cents: z.number().int().min(0).max(10_000_000).optional(),
  consultation_fee_cents: z.number().int().min(0).max(10_000_000).optional(),
  credentials: z.array(z.string().min(1).max(200)).max(20).optional().nullable(),
});

router.patch(
  '/doctors/:doctorId',
  authorize(UserRole.ADMIN, UserRole.DOCTOR),
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const doctorId = req.params.doctorId;
    const body = doctorUpdateSchema.parse(req.body);

    const existing = await prisma.doctor.findFirst({
      where: { id: doctorId, practiceId },
    });
    if (!existing) throw new AppError(404, 'Doctor not found');

    if (req.user!.role === UserRole.DOCTOR && existing.profileId !== req.user!.userId) {
      throw new AppError(403, 'You may only update your own public profile');
    }

    const data: Prisma.DoctorUpdateInput = {};
    if (body.bio !== undefined) data.bio = body.bio;
    if (body.telemedicine_fee_cents !== undefined) {
      data.telemedicineFeeCents = body.telemedicine_fee_cents;
    }
    if (body.consultation_fee_cents !== undefined) {
      data.consultationFeeCents = body.consultation_fee_cents;
    }
    if (body.credentials !== undefined) {
      data.credentials =
        body.credentials === null
          ? Prisma.DbNull
          : (body.credentials as Prisma.InputJsonValue);
    }

    const doctor = await prisma.doctor.update({
      where: { id: doctorId },
      data,
      include: { profile: { select: { fullName: true } } },
    });

    const photoUrl = await resolvePublicDoctorPhotoUrl({
      stored: doctor.photoUrl,
      practiceId,
      doctorId: doctor.id,
      publicApiOrigin: publicApiOriginFromRequest(req),
    });

    res.json(
      toSnakeCase({
        id: doctor.id,
        fullName: doctor.profile.fullName,
        specialization: doctor.specialization,
        consultationFeeCents: doctor.consultationFeeCents,
        telemedicineFeeCents: doctor.telemedicineFeeCents,
        bio: doctor.bio,
        photoUrl,
        credentials: Array.isArray(doctor.credentials) ? doctor.credentials : [],
        hpcsaRegistrationNumber: doctor.hpcsaRegistrationNumber,
        isVerified: doctor.isVerified,
      })
    );
  })
);

router.post(
  '/doctors/:doctorId/photo',
  authorize(UserRole.ADMIN, UserRole.DOCTOR),
  photoUpload.single('photo'),
  asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const doctorId = req.params.doctorId;
    if (!req.file?.buffer) throw new AppError(400, 'Photo file is required');

    // Tenant + ownership must pass before any bytes are written to durable storage.
    const existing = await prisma.doctor.findFirst({
      where: { id: doctorId, practiceId },
    });
    if (!existing) throw new AppError(404, 'Doctor not found');

    if (req.user!.role === UserRole.DOCTOR && existing.profileId !== req.user!.userId) {
      throw new AppError(403, 'You may only update your own public profile');
    }

    const detectedMime = detectAllowedImageMime(req.file.buffer);

    const { publicUrl } = await commitDoctorPhotoReplacement({
      practiceId,
      doctorId,
      buffer: req.file.buffer,
      mime: detectedMime,
      previousStored: existing.photoUrl,
      publicApiOrigin: publicApiOriginFromRequest(req),
      updateDatabase: async (storageKey) => {
        await prisma.doctor.update({
          where: { id: doctorId },
          data: { photoUrl: storageKey },
        });
      },
    });

    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, practiceId },
      include: { profile: { select: { fullName: true } } },
    });
    if (!doctor) throw new AppError(404, 'Doctor not found');

    res.json(
      toSnakeCase({
        id: doctor.id,
        fullName: doctor.profile.fullName,
        photoUrl: publicUrl,
      })
    );
  })
);

export default router;
