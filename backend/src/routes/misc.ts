import { Router } from 'express';
import {
  paymentController,
  messageController,
  auditController,
  telemedicineConsentController,
  dashboardController,
} from '../controllers/domainControllers';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '@prisma/client';
import { validateBody } from '../middleware/validation';
import { telemedicineConsentSchema } from '../validation/schemas';

const paymentsRouter = Router();
paymentsRouter.use(authenticate);
paymentsRouter.get('/count', paymentController.count);
paymentsRouter.get('/', paymentController.list);
paymentsRouter.post('/', authorize(UserRole.ADMIN), paymentController.create);
paymentsRouter.patch('/:id', authorize(UserRole.ADMIN, UserRole.DOCTOR), paymentController.update);

const messagesRouter = Router();
messagesRouter.use(authenticate);
messagesRouter.get('/unread-count', messageController.unreadCount);
messagesRouter.get('/', messageController.list);
messagesRouter.post('/start-admin', messageController.startAdmin);
messagesRouter.post('/', messageController.create);
messagesRouter.patch('/:id/read', messageController.markRead);

const auditRouter = Router();
auditRouter.use(authenticate);
auditRouter.get('/', authorize(UserRole.ADMIN), auditController.list);
auditRouter.post('/', auditController.create);

const consentRouter = Router();
consentRouter.use(authenticate);
consentRouter.get('/patient/:patientId', telemedicineConsentController.getForPatient);
consentRouter.post(
  '/',
  validateBody(telemedicineConsentSchema),
  telemedicineConsentController.create
);

const dashboardRouter = Router();
dashboardRouter.use(authenticate, authorize(UserRole.ADMIN));
dashboardRouter.get('/admin', dashboardController.adminStats);

export { paymentsRouter, messagesRouter, auditRouter, consentRouter, dashboardRouter };
