import type { DoctorPrivateNote } from './types';

export function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

/** Normalize API `doctor_notes_private` (string | array | null) into note objects. */
export function normalizeDoctorNotes(
  raw: DoctorPrivateNote[] | string | null | undefined
): DoctorPrivateNote[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const content = raw.trim();
    if (!content) return [];
    return [
      {
        id: uid(),
        heading: 'Private note',
        content,
        author_name: 'Doctor',
        created_at: new Date().toISOString(),
      },
    ];
  }
  if (Array.isArray(raw)) {
    return [...raw].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  return [];
}

export function recordWasEdited(createdAt: string, updatedAt: string): boolean {
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  return updated - created > 60_000;
}
