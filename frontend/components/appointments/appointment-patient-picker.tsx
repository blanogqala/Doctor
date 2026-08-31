'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/format';
import {
  clearPatientSelection,
  openCreateNewPatientFlow,
  resolvePatientPickerSurface,
  selectExistingPatient,
  selectNewPatientDraft,
  showCreateNewPatientAction,
  showIdleSearchField,
  showSearchResults,
  type DraftTelephonePatient,
} from '@/lib/appointments/patient-picker-ui';
import { findSimilarPatients, patientDisplayName } from '@/lib/patients/display-name';
import type { Patient } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Plus, Search, User } from 'lucide-react';

export type { DraftTelephonePatient };

interface AppointmentPatientPickerProps {
  patients: Patient[];
  value: string;
  draftPatient: DraftTelephonePatient | null;
  disabled?: boolean;
  onChange: (patientId: string) => void;
  onDraftPatient: (draft: DraftTelephonePatient | null) => void;
}

export function AppointmentPatientPicker({
  patients,
  value,
  draftPatient,
  disabled,
  onChange,
  onDraftPatient,
}: AppointmentPatientPickerProps) {
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const selected = patients.find((p) => p.id === value) ?? null;
  const surface = resolvePatientPickerSurface({
    creating,
    draftPatient,
    selectedPatientId: value,
    searchFocused,
    query,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return patients
      .filter((p) => {
        const name = patientDisplayName(p).toLowerCase();
        const id = (p.id_number_last4 ?? '').toLowerCase();
        return name.includes(q) || id.includes(q);
      })
      .slice(0, 40);
  }, [patients, query]);

  const matches = useMemo(
    () => findSimilarPatients(patients, firstName, lastName),
    [patients, firstName, lastName]
  );

  const applySelection = (next: { patientId: string; draft: DraftTelephonePatient | null }) => {
    onChange(next.patientId);
    onDraftPatient(next.draft);
  };

  const resetCreate = () => {
    setCreating(false);
    setConfirmNew(false);
    setFirstName('');
    setLastName('');
    setError(null);
  };

  const submitDraft = (force: boolean) => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and surname are required');
      return;
    }
    if (!force && matches.length > 0 && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    applySelection(
      selectNewPatientDraft({ first_name: firstName.trim(), last_name: lastName.trim() })
    );
    setQuery('');
    setSearchFocused(false);
    resetCreate();
  };

  const selectExisting = (patientId: string) => {
    applySelection(selectExistingPatient(patientId));
    setQuery('');
    setSearchFocused(false);
  };

  const changePatient = () => {
    applySelection(clearPatientSelection());
    setQuery('');
    setSearchFocused(false);
    resetCreate();
  };

  const startCreate = () => {
    applySelection(openCreateNewPatientFlow());
    setQuery('');
    setSearchFocused(false);
    setCreating(true);
    setConfirmNew(false);
    setFirstName('');
    setLastName('');
    setError(null);
  };

  if (disabled) {
    return (
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        {selected ? patientDisplayName(selected) : 'Select patient...'}
      </div>
    );
  }

  if (surface === 'creating') {
    return (
      <div className="space-y-3 rounded-md border bg-muted/20 p-3">
        <p className="text-sm font-medium">Create new patient</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quick-first-name">First Name *</Label>
            <Input
              id="quick-first-name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setConfirmNew(false);
              }}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-last-name">Surname *</Label>
            <Input
              id="quick-last-name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setConfirmNew(false);
              }}
              autoComplete="family-name"
            />
          </div>
        </div>
        {confirmNew && matches.length > 0 && (
          <div className="space-y-2 rounded-md border bg-background p-2">
            <p className="text-xs font-medium">Possible existing patients</p>
            <ul className="space-y-1">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      selectExisting(p.id);
                      resetCreate();
                    }}
                  >
                    <span className="font-medium">{patientDisplayName(p)}</span>
                    <span className="block text-xs text-muted-foreground">
                      DOB: {p.date_of_birth ? formatDate(p.date_of_birth) : '—'}
                      {p.id_number_last4 ? ` · ID: ******${p.id_number_last4}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={() => submitDraft(true)}>
              None of these — Create new patient
            </Button>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={changePatient}>
            Cancel
          </Button>
          <Button type="button" onClick={() => submitDraft(false)}>
            Create & Continue
          </Button>
        </div>
      </div>
    );
  }

  if (surface === 'draft' && draftPatient) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
              New patient
            </p>
            <p className="truncate text-sm">
              {draftPatient.first_name} {draftPatient.last_name}
            </p>
            <p className="text-xs text-muted-foreground">Not saved until appointment is created</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 px-1" onClick={changePatient}>
            Change patient
          </Button>
        </div>
      </div>
    );
  }

  if (surface === 'existing' && selected) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {patientDisplayName(selected)}
              {selected.id_number_last4 ? ` (...${selected.id_number_last4})` : ''}
            </span>
          </p>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 px-1" onClick={changePatient}>
            Change patient
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showIdleSearchField(surface) && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search/select patient..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="pl-9"
            aria-label="Search patient"
          />
        </div>
      )}
      {showSearchResults(surface) && (
        <div className="max-h-40 overflow-y-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching patients</p>
          ) : (
            <ul>
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted',
                      value === p.id && 'bg-primary/10'
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectExisting(p.id)}
                  >
                    <span>{patientDisplayName(p)}</span>
                    {p.id_number_last4 ? (
                      <span className="text-xs text-muted-foreground">...{p.id_number_last4}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showCreateNewPatientAction(surface) && (
        <Button type="button" variant="ghost" size="sm" className="px-1" onClick={startCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Create new patient
        </Button>
      )}
    </div>
  );
}
