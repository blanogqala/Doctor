import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toSnakeCase } from '../utils/serialize';
import { prisma } from '../config/database';
import { tenantWhere } from '../middleware/tenant';
import {
  listAvailabilityWindows,
  replaceWeekAvailability,
} from '../services/schedulingService';
import { assertActiveDoctorInPractice } from '../services/activeDoctor';

async function assertDoctorInPractice(doctorId: string, practiceId: string) {
  try {
    return await assertActiveDoctorInPractice(prisma, doctorId, practiceId);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400) {
      throw new AppError(404, err.message);
    }
    throw err;
  }
}

export const availabilityController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const doctorId = String(req.query.doctor_id || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!doctorId || !from || !to) {
      throw new AppError(400, 'doctor_id, from, and to are required');
    }
    await assertDoctorInPractice(doctorId, practiceId);
    const windows = await listAvailabilityWindows(doctorId, from, to);
    res.json(toSnakeCase(windows));
  }),

  replaceWeek: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId } = tenantWhere(req);
    const body = req.body as {
      doctor_id?: string;
      week_start?: string;
      days?: Array<{ date: string; blocks: Array<{ start_minute: number; end_minute: number }> }>;
    };
    if (!body.doctor_id || !body.week_start || !Array.isArray(body.days)) {
      throw new AppError(400, 'doctor_id, week_start, and days are required');
    }
    await assertDoctorInPractice(body.doctor_id, practiceId);
    const windows = await replaceWeekAvailability(body.doctor_id, body.week_start, body.days);
    res.json(toSnakeCase(windows));
  }),
};
