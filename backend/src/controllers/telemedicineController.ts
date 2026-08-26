import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { tenantWhere } from '../middleware/tenant';
import { assertAppointmentAccess } from '../services/accessService';
import { telemedicineService } from '../services/telemedicine/telemedicineService';
import { toSnakeCase } from '../utils/serialize';

async function assertTelemedicineRouteAccess(req: Request) {
  const { practiceId } = tenantWhere(req);
  const { userId, role } = req.user!;

  if (role === UserRole.ADMIN) {
    throw new AppError(403, 'Access denied');
  }

  await assertAppointmentAccess(userId, role, req.params.id, practiceId);
  return { practiceId, userId, role, actorId: userId };
}

export const telemedicineController = {
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId, userId, role } = await assertTelemedicineRouteAccess(req);
    const result = await telemedicineService.getStatus({
      appointmentId: req.params.id,
      practiceId,
      userId,
      role,
    });
    res.json(toSnakeCase(result));
  }),

  join: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId, userId, role, actorId } = await assertTelemedicineRouteAccess(req);
    const result = await telemedicineService.join({
      appointmentId: req.params.id,
      practiceId,
      userId,
      role,
      actorId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json(toSnakeCase(result));
  }),

  leave: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId, userId, role, actorId } = await assertTelemedicineRouteAccess(req);
    const result = await telemedicineService.leave({
      appointmentId: req.params.id,
      practiceId,
      userId,
      role,
      actorId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json(toSnakeCase(result));
  }),

  end: asyncHandler(async (req: Request, res: Response) => {
    const { practiceId, userId, role, actorId } = await assertTelemedicineRouteAccess(req);
    if (role !== UserRole.DOCTOR) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const result = await telemedicineService.end({
      appointmentId: req.params.id,
      practiceId,
      userId,
      role,
      actorId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json(toSnakeCase(result));
  }),
};
