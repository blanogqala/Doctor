import { CheckCircle2, Circle } from 'lucide-react';
import type { OnboardingChecklist } from '@/lib/api/super-admin';

const ITEMS: Array<{ key: keyof OnboardingChecklist; label: string }> = [
  { key: 'practice_created', label: 'Practice created' },
  { key: 'owner_invited', label: 'Owner invited' },
  { key: 'owner_activated', label: 'Owner activated' },
  { key: 'reception_active', label: 'Reception active' },
  { key: 'doctor_active', label: 'At least one Doctor active' },
];

export function OnboardingChecklistView({ checklist }: { checklist: OnboardingChecklist }) {
  return (
    <ul className="space-y-2 text-sm">
      {ITEMS.map(({ key, label }) => {
        const done = checklist[key];
        return (
          <li key={key} className="flex items-center gap-2">
            {done ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
            )}
            <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
