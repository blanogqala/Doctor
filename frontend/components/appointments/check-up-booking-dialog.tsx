'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SlotPicker } from '@/components/shared/slot-picker';
import { useToast } from '@/hooks/use-toast';
import { usePracticeAccess } from '@/lib/use-practice-access';
import { patientDisplayName } from '@/lib/patients/display-name';
import { appointmentsApi } from '@/lib/api/appointments';
import type { AppointmentType, Doctor, MedicalRecord, Patient } from '@/lib/types';
import { Building2, Loader2, Video } from 'lucide-react';

export interface CheckUpBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient;
  parentRecord: MedicalRecord;
  doctors: Doctor[];
  onBooked?: (result: {
    appointment: import('@/lib/types').Appointment;
    medical_record: MedicalRecord;
  }) => void;
}

export function CheckUpBookingDialog({
  open,
  onOpenChange,
  patient,
  parentRecord,
  doctors,
  onBooked,
}: CheckUpBookingDialogProps) {
  const { toast } = useToast();
  const { canMutate, mutationHint } = usePracticeAccess();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    doctor_id: '',
    date: '',
    scheduled_at: '',
    duration_minutes: '30',
    type: 'IN_PERSON' as AppointmentType,
    reason: 'check-up',
  });

  useEffect(() => {
    if (!open) return;
    const defaultDoctor =
      parentRecord.doctor_id ||
      patient.assigned_doctor_id ||
      doctors[0]?.id ||
      '';
    setForm({
      doctor_id: defaultDoctor,
      date: '',
      scheduled_at: '',
      duration_minutes: '30',
      type: 'IN_PERSON',
      reason: 'check-up',
    });
    // Only reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCreate = async () => {
    if (!form.doctor_id || !form.scheduled_at) {
      toast({
        title: 'Missing fields',
        description: 'Select a doctor and available time slot.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const result = await appointmentsApi.createCheckUp({
        parent_record_id: parentRecord.id,
        patient_id: patient.id,
        doctor_id: form.doctor_id,
        scheduled_at: form.scheduled_at,
        duration_minutes: parseInt(form.duration_minutes, 10) || 30,
        type: form.type,
        reason: form.reason.trim() || 'check-up',
      });
      toast({
        title: 'Check-up booked',
        description:
          form.type === 'TELEMEDICINE'
            ? 'Patient will be asked to confirm video or switch to in-person.'
            : 'In-person check-up created under this visit.',
      });
      onBooked?.(result);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Booking failed',
        description: err instanceof Error ? err.message : 'Could not book check-up',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Book Check-up</DialogTitle>
          <DialogDescription>
            Book a check-up appointment linked to this visit for{' '}
            {patientDisplayName(patient)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Patient *</Label>
            <Input
              value={
                `${patientDisplayName(patient)}${
                  patient.id_number_last4 ? ` (...${patient.id_number_last4})` : ''
                }`
              }
              disabled
              className="bg-muted/50"
            />
          </div>
          <div className="space-y-2">
            <Label>Doctor *</Label>
            <Select
              value={form.doctor_id}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, doctor_id: v, scheduled_at: '', date: f.date }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select doctor..." />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.profile?.full_name} — {d.specialization}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Duration (min)</Label>
            <Select
              value={form.duration_minutes}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, duration_minutes: v, scheduled_at: '' }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <SlotPicker
            doctorId={form.doctor_id}
            date={form.date}
            onDateChange={(date) => setForm((f) => ({ ...f, date, scheduled_at: '' }))}
            selectedStart={form.scheduled_at}
            onSelectStart={(scheduled_at) => setForm((f) => ({ ...f, scheduled_at }))}
            durationMinutes={parseInt(form.duration_minutes, 10) || 30}
          />
          <div className="space-y-2">
            <Label>Consultation Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as AppointmentType }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_PERSON">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    In Person
                  </span>
                </SelectItem>
                <SelectItem value="TELEMEDICINE">
                  <span className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Telemedicine (Video)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Admins can assign in-person or telemedicine. Telemedicine check-ups require the
              patient to confirm video or switch to in-person.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Reason for Visit</Label>
            <Textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving || !canMutate} title={!canMutate ? mutationHint : undefined}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
