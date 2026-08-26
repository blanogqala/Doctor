'use client';

import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export const PATIENT_FOLDER_TAB_TRIGGER_CLASS = cn(
  'min-h-11 shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors',
  'data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground',
  'data-[state=inactive]:hover:bg-background/60 data-[state=inactive]:hover:text-foreground',
  'data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground',
  'data-[state=active]:shadow-none'
);

interface PatientFolderSectionNavProps {
  sections: ReadonlyArray<{ id: string; label: string }>;
  className?: string;
}

/** Primary Patient Folder section navigation — distinct tab bar surface. */
export function PatientFolderSectionNav({ sections, className }: PatientFolderSectionNavProps) {
  return (
    <div className={cn('min-w-0 overflow-x-auto scrollbar-thin', className)}>
      <TabsList
        className={cn(
          'inline-flex h-auto min-h-11 w-max max-w-none gap-1 rounded-xl border border-border/60 bg-muted/40 p-1'
        )}
      >
        {sections.map((section) => (
          <TabsTrigger
            key={section.id}
            value={section.id}
            className={PATIENT_FOLDER_TAB_TRIGGER_CLASS}
          >
            {section.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
