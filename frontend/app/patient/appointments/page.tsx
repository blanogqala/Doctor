'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Old My Appointments route — redirect to Book Appointment. */
export default function PatientAppointmentsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/patient/book');
  }, [router]);
  return null;
}
