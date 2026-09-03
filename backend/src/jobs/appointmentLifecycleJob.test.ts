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
      .mockResolvedValueOnce([
        {
          id: 'a1',
          practice: {
            subscriptionStatus: 'ACTIVE',
            subscriptionSuspensionReason: null,
            subscriptionSuspendedAt: null,
            trialEndsAt: null,
            ownerProfileId: 'owner-1',
          },
        },
      ]) // reminders
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

  it('84. skips reminder mutation for billing READ_ONLY Practice', async () => {
    (prisma.appointment.findMany as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 'a-ro',
          practice: {
            subscriptionStatus: 'SUSPENDED',
            subscriptionSuspensionReason: 'BILLING_OVERDUE',
            subscriptionSuspendedAt: new Date(),
            trialEndsAt: null,
            ownerProfileId: 'owner-1',
          },
        },
      ])
      .mockResolvedValueOnce([]);

    await runAppointmentLifecycleJob();

    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(notifyAppointmentReminder).not.toHaveBeenCalled();
  });

  it('85. skips no-show mutation for MANUAL/CANCELLED', async () => {
    (prisma.appointment.findMany as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'a-manual',
          practice: {
            subscriptionStatus: 'SUSPENDED',
            subscriptionSuspensionReason: 'MANUAL',
            subscriptionSuspendedAt: new Date(),
            trialEndsAt: null,
            ownerProfileId: 'owner-1',
          },
        },
      ]);

    await runAppointmentLifecycleJob();

    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('86. continues lifecycle for FULL payment-grace Practice', async () => {
    (notifyAppointmentReminder as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (prisma.appointment.findMany as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 'a-grace',
          practice: {
            subscriptionStatus: 'TRIAL',
            subscriptionSuspensionReason: null,
            subscriptionSuspendedAt: null,
            trialEndsAt: new Date('2020-01-01T00:00:00.000Z'),
            ownerProfileId: 'owner-1',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    (prisma.appointment.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await runAppointmentLifecycleJob();

    expect(prisma.appointment.updateMany).toHaveBeenCalled();
    expect(notifyAppointmentReminder).toHaveBeenCalledWith('a-grace');
  });
});
