'use client';

import { Button } from '@/components/ui/button';
import { CalendarDays, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'calendar' | 'table';

interface ViewToggleProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/30 p-0.5">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'gap-1.5 rounded-md px-3 transition-all',
          view === 'calendar'
            ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => onChange('calendar')}
      >
        <CalendarDays className="h-4 w-4" />
        <span className="hidden sm:inline">Calendar</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'gap-1.5 rounded-md px-3 transition-all',
          view === 'table'
            ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => onChange('table')}
      >
        <List className="h-4 w-4" />
        <span className="hidden sm:inline">List</span>
      </Button>
    </div>
  );
}
