import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { availabilityController } from '../controllers/availabilityController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', availabilityController.list);
router.put('/week', authorize(UserRole.ADMIN), availabilityController.replaceWeek);

export default router;
