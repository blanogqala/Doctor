'use client';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ds/status-badge';
import { ageFromDob, doctorDisplayName, formatGenderLabel } from '@/lib/clinical/patient-folder';
import { initials, maskIdNumber } from '@/lib/format';
import { patientDisplayName } from '@/lib/patients/display-name';
import type { Patient } from '@/lib/types';
import { ArrowLeft, Plus, CalendarPlus, CreditCard, Stethoscope, Phone } from 'lucide-react';

export function PatientFolderHeader({
  patient,
  onBack,
  onNewConsultation,
  onBookFollowUp,
}: {
  patient: Patient;
  onBack?: () => void;
  onNewConsultation?: () => void;
  onBookFollowUp?: () => void;
}) {
  const name = patientDisplayName(patient);
  const age = ageFromDob(patient.date_of_birth);
  const gender = formatGenderLabel(patient.gender);
  const demographics = [gender, age != null ? `${age} yrs` : null].filter(Boolean).join(', ');
  const doctor = patient.assigned_doctor?.profile?.full_name
    ? doctorDisplayName(patient.assigned_doctor.profile.full_name)
    : null;
  const patientId = maskIdNumber(patient.id_number) ?? patient.id.slice(0, 8);
  const archived = Boolean(patient.soft_deleted_at);
  const phone = patient.phone ?? patient.profile?.phone;

  return (
    <header className="space-y-4">
      {onBack && (
        <Button variant="outline" size="sm" onClick={onBack} className="group">
          <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Patient Folders
        </Button>
      )}

      <div className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-primary/30 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-4 sm:items-center">
          <div className="relative shrink-0">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
              <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground sm:text-xl">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <span
              className={`absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-primary/30 ${
                archived ? 'bg-muted-foreground' : 'bg-success'
              }`}
              aria-hidden
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-page-title truncate">{name}</h1>
              <StatusBadge
                tone={archived ? 'neutral' : 'success'}
                label={archived ? 'Archived' : 'Active'}
              />
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {demographics && <span>{demographics}</span>}
              <span className="inline-flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ID: {patientId}
              </span>
              {doctor && (
                <span className="inline-flex items-center gap-1">
                  <Stethoscope className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {doctor}
                </span>
              )}
            </p>
            {phone && (
              <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {phone}
              </p>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
          {onBookFollowUp && (
            <Button
              variant="outline"
              onClick={onBookFollowUp}
              className="min-h-11 w-full border-primary text-primary hover:bg-primary/10 sm:w-auto"
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Book Follow-up
            </Button>
          )}
          {onNewConsultation && (
            <Button onClick={onNewConsultation} className="min-h-11 w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              New Consultation
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
