import { Router } from 'express';
import multer from 'multer';
import { UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth';
import { aiController } from '../controllers/aiController';
import { recordingConsentController } from '../controllers/recordingConsentController';
import { AppError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validation';
import {
  recordingConsentCreateSchema,
  clinicalLetterDraftSchema,
} from '../validation/schemas';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (
      mime.startsWith('audio/') ||
      mime === 'video/webm' ||
      mime === 'application/octet-stream'
    ) {
      cb(null, true);
      return;
    }
    cb(new AppError(400, `Unsupported file type: ${file.mimetype}`) as unknown as Error);
  },
});

const router = Router();

router.use(authenticate);

router.post(
  '/recording-consent',
  authorize(UserRole.DOCTOR),
  validateBody(recordingConsentCreateSchema),
  recordingConsentController.create
);

router.post(
  '/consultation-scribe',
  authorize(UserRole.DOCTOR),
  (req, res, next) => {
    upload.single('audio')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError(413, 'Audio file exceeds 25MB limit'));
        }
        return next(new AppError(400, err.message));
      }
      if (err) return next(err);
      next();
    });
  },
  aiController.consultationScribe
);

router.post(
  '/referral-enhance',
  authorize(UserRole.DOCTOR),
  aiController.referralEnhance
);

router.post(
  '/referral-draft',
  authorize(UserRole.DOCTOR),
  aiController.referralDraft
);

router.post(
  '/clinical-letter-draft',
  authorize(UserRole.DOCTOR),
  validateBody(clinicalLetterDraftSchema),
  aiController.clinicalLetterDraft
);

router.post(
  '/suggestion-decision',
  authorize(UserRole.DOCTOR),
  aiController.suggestionDecision
);

export default router;
