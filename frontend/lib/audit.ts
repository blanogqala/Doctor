/**
 * Client-side audit helper is intentionally a no-op.
 * Audit events are written server-side only to prevent forged trails.
 */
export async function logAudit(_entry: {
  action: string;
  resource: string;
  resource_id?: string | null;
  patient_id?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
}) {
  return;
}
