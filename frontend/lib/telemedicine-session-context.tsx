'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TelemedicineSessionState } from '@/lib/api/telemedicine';

export interface TelemedicineSession {
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorName?: string;
  recordId?: string;
  patientJoinedAt?: string | null;
  doctorJoinedAt?: string | null;
  telemedicineEndedAt?: string | null;
  reason?: string | null;
}

export interface LiveKitCredentials {
  url: string;
  token: string;
  roomName: string;
}

interface TelemedicineSessionContextValue {
  session: TelemedicineSession | null;
  sessionState: TelemedicineSessionState | null;
  livekit: LiveKitCredentials | null;
  minimized: boolean;
  expanded: boolean;
  callStartedAt: string | null;
  openSession: (session: TelemedicineSession) => void;
  setLivekit: (credentials: LiveKitCredentials | null, sessionState?: TelemedicineSessionState) => void;
  updateSession: (patch: Partial<TelemedicineSession>) => void;
  setSessionState: (state: TelemedicineSessionState | null) => void;
  endSession: () => void;
  setMinimized: (value: boolean) => void;
  setExpanded: (value: boolean) => void;
}

const TelemedicineSessionContext = createContext<TelemedicineSessionContextValue | null>(null);

const STORAGE_KEY = 'ec-doctor-telemedicine-session';

function readStoredSession(): TelemedicineSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TelemedicineSession;
    if (!parsed?.appointmentId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: TelemedicineSession | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!session) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore quota / private mode
  }
}

/** @deprecated Use livekit.roomName from join response */
export function roomNameForAppointment(appointmentId: string) {
  return `MediNathi-appt-${appointmentId}`;
}

export function TelemedicineSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TelemedicineSession | null>(null);
  const [sessionState, setSessionState] = useState<TelemedicineSessionState | null>(null);
  const [livekit, setLivekitState] = useState<LiveKitCredentials | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      setSession(stored);
      setMinimized(false);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredSession(session);
  }, [session, hydrated]);

  const openSession = useCallback((next: TelemedicineSession) => {
    setSession(next);
    setMinimized(false);
    setExpanded(false);
  }, []);

  const setLivekit = useCallback(
    (credentials: LiveKitCredentials | null, nextState?: TelemedicineSessionState) => {
      setLivekitState(credentials);
      if (nextState) setSessionState(nextState);
      if (credentials && !callStartedAt) {
        setCallStartedAt(new Date().toISOString());
      }
      if (!credentials) {
        setCallStartedAt(null);
      }
    },
    [callStartedAt]
  );

  const endSession = useCallback(() => {
    setSession(null);
    setSessionState(null);
    setLivekitState(null);
    setCallStartedAt(null);
    setMinimized(false);
    setExpanded(false);
    writeStoredSession(null);
  }, []);

  const updateSession = useCallback((patch: Partial<TelemedicineSession>) => {
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo<TelemedicineSessionContextValue>(
    () => ({
      session,
      sessionState,
      livekit,
      minimized,
      expanded,
      callStartedAt,
      openSession,
      setLivekit,
      updateSession,
      setSessionState,
      endSession,
      setMinimized,
      setExpanded,
    }),
    [
      session,
      sessionState,
      livekit,
      minimized,
      expanded,
      callStartedAt,
      openSession,
      setLivekit,
      updateSession,
      endSession,
    ]
  );

  return (
    <TelemedicineSessionContext.Provider value={value}>
      {children}
    </TelemedicineSessionContext.Provider>
  );
}

export function useTelemedicineSession() {
  const ctx = useContext(TelemedicineSessionContext);
  if (!ctx) {
    throw new Error('useTelemedicineSession must be used within TelemedicineSessionProvider');
  }
  return ctx;
}

export function useTelemedicineSessionOptional() {
  return useContext(TelemedicineSessionContext);
}
