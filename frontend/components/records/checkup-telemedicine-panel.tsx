'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/lib/auth-context';
import { appointmentsApi } from '@/lib/api/appointments';
import { telemedicineApi } from '@/lib/api/telemedicine';
import { useTelemedicineSession } from '@/lib/telemedicine-session-context';
import { useTelemedicineJoin } from '@/hooks/useTelemedicineJoin';
import { useToast } from '@/hooks/use-toast';
import { usePollingRefresh } from '@/lib/use-polling-refresh';
import type { Appointment } from '@/lib/types';
import { PreCallDeviceCheck } from '@/components/telemedicine/pre-call-device-check';
import { TelemedicineUnavailable } from '@/components/telemedicine/telemedicine-unavailable';
import { Video, Loader2, ShieldCheck } from 'lucide-react';

const APPT_POLL_MS = 10_000;
const EMBED_SLOT_ID = 'telemedicine-embed-slot';

interface CheckupTelemedicinePanelProps {
  appointment: Appointment;
  recordId?: string;
  onAppointmentChange?: (appt: Appointment) => void;
}

export function CheckupTelemedicinePanel({
  appointment,
  recordId,
  onAppointmentChange,
}: CheckupTelemedicinePanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { session, livekit } = useTelemedicineSession();
  const { joinCall, joining } = useTelemedicineJoin();
  const [liveAppt, setLiveAppt] = useState(appointment);
  const [precallDone, setPrecallDone] = useState(false);
  const [providerOk, setProviderOk] = useState<boolean | null>(null);

  const onChangeRef = useRef(onAppointmentChange);
  onChangeRef.current = onAppointmentChange;

  useEffect(() => {
    setLiveAppt(appointment);
  }, [appointment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAppointment = useCallback(async () => {
    try {
      const updated = await appointmentsApi.get(appointment.id);
      setLiveAppt(updated);
      onChangeRef.current?.(updated);
    } catch {
      // ignore transient poll errors
    }
  }, [appointment.id]);

  usePollingRefresh(refreshAppointment, APPT_POLL_MS, true);

  useEffect(() => {
    void telemedicineApi
      .getStatus(appointment.id)
      .then((s) => setProviderOk(s.provider_configured))
      .catch(() => setProviderOk(false));
  }, [appointment.id]);

  const inCall = session?.appointmentId === liveAppt.id && Boolean(livekit);
  const patientWaiting = Boolean(liveAppt.patient_joined_at);

  const handleJoin = async () => {
    if (!user?.doctor?.id) return;
    try {
      await joinCall({
        appointmentId: liveAppt.id,
        patientId: liveAppt.patient_id,
        patientName:
          liveAppt.patient?.profile?.full_name ??
          appointment.patient?.profile?.full_name ??
          'Patient',
        recordId,
        reason: liveAppt.reason,
      });
      await refreshAppointment();
    } catch {
      // toast handled in hook
    }
  };

  if (providerOk === false) {
    return (
      <TelemedicineUnavailable message="Virtual consultations are temporarily unavailable. Please try again shortly." />
    );
  }

  return (
    <div className="space-y-4">
      <Alert className="border-teal-200 bg-teal-50">
        <ShieldCheck className="h-4 w-4 text-teal-700" />
        <AlertDescription className="text-teal-900">
          <strong>Start virtual consultation</strong> connects secure video with your patient.
          For AI SOAP notes, press <strong>Record Consultation</strong> in the header — that records
          your microphone only, not the patient&apos;s remote audio. Leaving this record keeps the
          call in a floating window so you can navigate the portal.
        </AlertDescription>
      </Alert>

      {!inCall && !precallDone && (
        <PreCallDeviceCheck onReady={() => setPrecallDone(true)} />
      )}

      {!inCall && precallDone && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void handleJoin()} disabled={joining}>
            {joining ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Video className="mr-2 h-4 w-4" />
            )}
            {liveAppt.doctor_joined_at ? 'Rejoin video' : 'Start virtual consultation'}
          </Button>
          {patientWaiting && (
            <p className="text-sm text-emerald-700">Patient is waiting in the virtual waiting room</p>
          )}
        </div>
      )}

      <div id={EMBED_SLOT_ID} className={inCall ? 'block' : 'hidden'} aria-live="polite" />

      {!inCall && (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Complete the device check, then start the virtual consultation to connect with your patient.
        </div>
      )}
    </div>
  );
}
