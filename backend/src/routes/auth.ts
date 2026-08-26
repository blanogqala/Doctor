import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate, authorize } from '../middleware/auth';
import { requireTenant } from '../middleware/tenant';
import { UserRole } from '@prisma/client';

const router = Router();

router.post('/login', requireTenant, authController.login);
router.post('/register', requireTenant, authController.register);
router.post('/forgot-password', requireTenant, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/me', authController.me);
router.post('/logout', requireTenant, authenticate, authController.logout);
router.post('/change-password', requireTenant, authenticate, authController.changePassword);
router.post(
  '/admin/create-patient',
  requireTenant,
  authenticate,
  authorize(UserRole.ADMIN),
  authController.adminCreatePatient
);
router.post(
  '/admin/patients/:profileId/resend-activation',
  requireTenant,
  authenticate,
  authorize(UserRole.ADMIN),
  authController.resendPatientActivation
);

export default router;
