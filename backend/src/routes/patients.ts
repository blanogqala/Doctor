import { Router } from 'express';
import { patientController, doctorController, profileController } from '../controllers/patientController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate);

router.get('/check-email', authorize(UserRole.ADMIN), profileController.checkEmail);
router.patch('/profile', profileController.update);

router.get('/', authorize(UserRole.ADMIN, UserRole.DOCTOR), patientController.list);
router.get('/:id', patientController.getById);
router.patch('/:id', authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT), patientController.update);
router.delete('/:id', authorize(UserRole.ADMIN), patientController.softDelete);
router.get('/:id/medical-records/count', patientController.countMedicalRecords);

export default router;
