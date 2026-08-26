import { Router } from 'express';
import { doctorController } from '../controllers/patientController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', doctorController.list);

export default router;
