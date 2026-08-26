import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClinicalIntegrityNoticeProps {
  className?: string;
}

/** Quiet informational notice about finalized record immutability. */
export function ClinicalIntegrityNotice({ className }: ClinicalIntegrityNoticeProps) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2',
        className
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-caption text-muted-foreground">
        Finalized medical records are immutable. Use amendments to correct errors without
        rewriting clinical history.
      </p>
    </div>
  );
}
