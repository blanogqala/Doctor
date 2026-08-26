'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { appointmentsApi } from '@/lib/api/appointments';
import { formatTime, toDateInput } from '@/lib/format';
import type { AppointmentSlot } from '@/lib/types';
import { cn } from '@/lib/utils';

export function SlotPicker({
  doctorId,
  date,
  onDateChange,
  selectedStart,
  onSelectStart,
  durationMinutes = 30,
  excludeId,
  disabled,
}: {
  doctorId: string;
  date: string;
  onDateChange: (date: string) => void;
  selectedStart: string;
  onSelectStart: (isoStart: string) => void;
  durationMinutes?: number;
  excludeId?: string;
  disabled?: boolean;
}) {
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doctorId || !date) {
      setSlots([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    appointmentsApi
      .slots({
        doctor_id: doctorId,
        date,
        duration_minutes: durationMinutes,
        exclude_id: excludeId,
      })
      .then((data) => {
        if (cancelled) return;
        setSlots(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setSlots([]);
        setError(err instanceof Error ? err.message : 'Failed to load slots');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId, date, durationMinutes, excludeId]);

  const minDate = toDateInput(new Date());

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Date *</Label>
        <Input
          type="date"
          value={date}
          min={minDate}
          disabled={disabled || !doctorId}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Available times *</Label>
        {!doctorId ? (
          <p className="text-xs text-muted-foreground">Select a doctor first.</p>
        ) : !date ? (
          <p className="text-xs text-muted-foreground">
            Select a date to see open slots. Taken times are hidden. Each booking includes
            consultation length plus a 5-minute gap.
          </p>
        ) : loading ? (
          <p className="text-xs text-muted-foreground">Loading available times…</p>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : slots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No open times for this date. Confirm the doctor&apos;s hours were saved under Admin →
            Settings for that day, or pick another date.
          </p>
        ) : (
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
            {slots.map((slot) => {
              const selected =
                selectedStart &&
                new Date(selectedStart).getTime() === new Date(slot.start).getTime();
              return (
                <Button
                  key={slot.start}
                  type="button"
                  size="sm"
                  variant={selected ? 'default' : 'outline'}
                  className={cn('min-w-[72px]', selected && 'ring-2 ring-primary/30')}
                  onClick={() => onSelectStart(slot.start)}
                >
                  {formatTime(slot.start)}
                </Button>
              );
            })}
          </div>
        )}
        {date ? (
          <p className="text-xs text-muted-foreground">
            Taken times are hidden. Each booking includes consultation length plus a 5-minute gap.
          </p>
        ) : null}
      </div>
    </div>
  );
}
