import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
    appointment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../services/messageService', () => ({
  ACTIVE_BOOKING_STATUSES: ['SCHEDULED', 'CONFIRMED'],
  notifyAppointmentReminder: vi.fn(),
  notifyAppointmentNoShow: vi.fn(),
}));

import { prisma } from '../config/database';
import { notifyAppointmentReminder } from '../services/messageService';
import { runAppointmentLifecycleJob } from '../jobs/appointmentLifecycleJob';

describe('appointment reminder delivery claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ locked: true }]);
    (prisma.appointment.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 'a1' }]) // reminders
      .mockResolvedValueOnce([]); // no-shows
    (prisma.appointment.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
  });

  it('rolls back reminderSentAt when notify fails', async () => {
    (notifyAppointmentReminder as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('delivery failed')
    );

    await runAppointmentLifecycleJob();

    expect(prisma.appointment.updateMany).toHaveBeenCalled();
    expect(notifyAppointmentReminder).toHaveBeenCalledWith('a1');
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { reminderSentAt: null },
    });
  });

  it('keeps reminderSentAt when notify succeeds', async () => {
    (notifyAppointmentReminder as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    await runAppointmentLifecycleJob();

    expect(notifyAppointmentReminder).toHaveBeenCalledWith('a1');
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });
});
