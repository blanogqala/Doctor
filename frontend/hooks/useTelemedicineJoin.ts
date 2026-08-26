'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTelemedicineSession } from '@/lib/telemedicine-session-context';
import { telemedicineApi } from '@/lib/api/telemedicine';
import { useToast } from '@/hooks/use-toast';

export function useTelemedicineJoin() {
  const { user } = useAuth();
  const { openSession, setLivekit, updateSession, setSessionState } = useTelemedicineSession();
  const { toast } = useToast();
  const [joining, setJoining] = useState(false);

  const joinCall = useCallback(
    async (input: {
      appointmentId: string;
      patientId: string;
      patientName: string;
      doctorName?: string;
      reason?: string | null;
      recordId?: string;
    }) => {
      setJoining(true);
      try {
        const response = await telemedicineApi.join(input.appointmentId);
        openSession({
          appointmentId: input.appointmentId,
          patientId: input.patientId,
          patientName: input.patientName,
          doctorName: input.doctorName ?? response.appointment.doctor_name,
          reason: input.reason ?? response.appointment.reason,
          recordId: input.recordId,
          doctorJoinedAt: response.appointment.doctor_joined_at,
          patientJoinedAt: response.appointment.patient_joined_at,
          telemedicineEndedAt: response.appointment.telemedicine_ended_at,
        });
        setLivekit(
          {
            url: response.livekit.url,
            token: response.livekit.token,
            roomName: response.livekit.room_name,
          },
          response.session_state
        );
        setSessionState(response.session_state);
        return response;
      } catch (err) {
        toast({
          title: 'Could not join virtual consultation',
          description: err instanceof Error ? err.message : 'Join failed',
          variant: 'destructive',
        });
        throw err;
      } finally {
        setJoining(false);
      }
    },
    [openSession, setLivekit, setSessionState, toast]
  );

  const leaveCall = useCallback(
    async (appointmentId: string) => {
      try {
        await telemedicineApi.leave(appointmentId);
      } catch {
        // still disconnect locally
      }
    },
    []
  );

  const endCall = useCallback(async (appointmentId: string) => {
    return telemedicineApi.end(appointmentId);
  }, []);

  return {
    joinCall,
    leaveCall,
    endCall,
    joining,
    role: user?.role,
  };
}
