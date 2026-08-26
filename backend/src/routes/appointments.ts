import { Router } from 'express';
import { appointmentController } from '../controllers/appointmentController';
import { telemedicineController } from '../controllers/telemedicineController';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  appointmentCreateSchema,
  appointmentUpdateSchema,
} from '../validation/schemas';

const router = Router();

router.use(authenticate);

router.get('/stats', appointmentController.dashboardStats);
router.get('/count', appointmentController.count);
router.get('/slots', appointmentController.slots);
router.get('/', appointmentController.list);
router.get('/:id/telemedicine', telemedicineController.getStatus);
router.post('/:id/telemedicine/join', telemedicineController.join);
router.post('/:id/telemedicine/leave', telemedicineController.leave);
router.post('/:id/telemedicine/end', telemedicineController.end);
router.get('/:id', appointmentController.getById);
router.post('/check-up', appointmentController.createCheckUp);
router.post('/', validateBody(appointmentCreateSchema), appointmentController.create);
router.post('/:id/telemedicine-decision', appointmentController.confirmTelemedicine);
router.patch('/:id', validateBody(appointmentUpdateSchema), appointmentController.update);

export default router;
