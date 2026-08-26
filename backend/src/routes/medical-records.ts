import { Router } from 'express';
import multer from 'multer';
import { UserRole } from '@prisma/client';
import { medicalRecordController } from '../controllers/medicalRecordController';
import { authenticate, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { detectAudioMimeFromBuffer } from '../utils/fileSignature';
import { validateBody } from '../middleware/validation';
import {
  amendmentSchema,
  medicalRecordCreateSchema,
  medicalRecordUpdateSchema,
} from '../validation/schemas';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (mime.startsWith('audio/') || mime === 'video/webm') {
      cb(null, true);
      return;
    }
    cb(new AppError(400, `Unsupported file type: ${file.mimetype}`) as unknown as Error);
  },
});

const router = Router();

router.use(authenticate);

router.get('/count', authorize(UserRole.DOCTOR, UserRole.PATIENT, UserRole.ADMIN), medicalRecordController.count);
router.get('/', authorize(UserRole.DOCTOR, UserRole.PATIENT, UserRole.ADMIN), medicalRecordController.list);
router.get(
  '/:id/consultation-audio',
  authorize(UserRole.DOCTOR),
  medicalRecordController.streamConsultationAudio
);
router.get('/:id', authorize(UserRole.DOCTOR, UserRole.PATIENT, UserRole.ADMIN), medicalRecordController.getById);
router.post(
  '/',
  authorize(UserRole.DOCTOR),
  validateBody(medicalRecordCreateSchema),
  medicalRecordController.create
);
router.patch(
  '/:id',
  authorize(UserRole.DOCTOR),
  validateBody(medicalRecordUpdateSchema),
  medicalRecordController.update
);
router.post(
  '/:id/consultation-recording',
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
  (req, _res, next) => {
    const file = req.file;
    if (!file) return next();
    const detected = detectAudioMimeFromBuffer(file.buffer);
    if (!detected) {
      return next(new AppError(400, 'File content is not a recognized audio format'));
    }
    file.mimetype = detected;
    next();
  },
  medicalRecordController.uploadConsultationRecording
);
router.post(
  '/:id/amendments',
  authorize(UserRole.DOCTOR),
  validateBody(amendmentSchema),
  medicalRecordController.addAmendment
);

export default router;
