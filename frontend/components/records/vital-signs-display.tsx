import type { VitalSigns } from '@/lib/types';
import { cn } from '@/lib/utils';

function hasAnyVitals(v: VitalSigns | null | undefined): boolean {
  if (!v) return false;
  return Object.values(v).some((x) => x != null && x !== '');
}

export function VitalSignsDisplay({
  vitals,
  className,
}: {
  vitals: VitalSigns | null | undefined;
  className?: string;
}) {
  if (!hasAnyVitals(vitals)) return null;
  const v = vitals!;

  const items: { label: string; value: string }[] = [];
  if (v.bp_systolic != null || v.bp_diastolic != null) {
    items.push({
      label: 'BP',
      value: `${v.bp_systolic ?? '—'}/${v.bp_diastolic ?? '—'}`,
    });
  }
  if (v.hr != null) items.push({ label: 'HR', value: String(v.hr) });
  if (v.temp != null) items.push({ label: 'Temp', value: `${v.temp}°C` });
  if (v.rr != null) items.push({ label: 'RR', value: String(v.rr) });
  if (v.spo2 != null) items.push({ label: 'SpO₂', value: `${v.spo2}%` });
  if (v.weight != null) items.push({ label: 'Wt', value: `${v.weight} kg` });
  if (v.height != null) items.push({ label: 'Ht', value: `${v.height} cm` });
  if (v.bmi != null) items.push({ label: 'BMI', value: String(v.bmi) });

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8',
        className
      )}
      role="group"
      aria-label="Vital signs"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-center"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
