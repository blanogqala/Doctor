'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DoctorPrivateNote } from '@/lib/types';
import { uid } from '@/lib/doctor-notes';
import { formatDate } from '@/lib/format';
import { Lock, Plus, Info, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DoctorsNotesTabProps {
  notes: DoctorPrivateNote[];
  onChange?: (notes: DoctorPrivateNote[]) => void;
  readOnly?: boolean;
  doctorName?: string;
}

export function DoctorsNotesTab({
  notes,
  onChange,
  readOnly = false,
  doctorName = 'Doctor',
}: DoctorsNotesTabProps) {
  const [adding, setAdding] = useState(false);
  const [heading, setHeading] = useState('');
  const [content, setContent] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveNote = () => {
    if (!heading.trim() || !content.trim() || !onChange) return;
    const note: DoctorPrivateNote = {
      id: uid(),
      heading: heading.trim(),
      content: content.trim(),
      author_name: doctorName.replace(/^Dr\.\s*/i, ''),
      created_at: new Date().toISOString(),
    };
    onChange([note, ...notes]);
    setHeading('');
    setContent('');
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    if (!onChange) return;
    onChange(notes.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Lock className="h-4 w-4 text-amber-600" />
            Doctor&apos;s Private Notes
          </h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Visible only to medical staff, not patients</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Badge variant="secondary" className="gap-1 text-xs">
            <Lock className="h-3 w-3" /> Staff Only
          </Badge>
        </div>
        {!readOnly && !adding && (
          <Button onClick={() => setAdding(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add New Note
          </Button>
        )}
      </div>

      {!readOnly && adding && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1">
              <Label>Heading *</Label>
              <Input
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                placeholder="Note title"
              />
            </div>
            <div className="space-y-1">
              <Label>Content *</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Detailed private clinical notes..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setHeading('');
                  setContent('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveNote}
                disabled={!heading.trim() || !content.trim()}
              >
                Save Note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No private notes yet.</p>
          {!readOnly && (
            <Button onClick={() => setAdding(true)} className="mt-3" size="sm" variant="outline">
              <Plus className="mr-1 h-4 w-4" /> Add First Note
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const long = note.content.length > 280;
            const expanded = expandedIds.has(note.id);
            const display = long && !expanded ? `${note.content.slice(0, 280)}…` : note.content;
            return (
              <Card key={note.id} className="border-amber-100">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4 pb-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm font-semibold">{note.heading}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(note.created_at, true)}
                      {note.author_name ? ` · Dr. ${note.author_name.replace(/^Dr\.\s*/i, '')}` : ''}
                    </p>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(note.id)}
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className={cn('whitespace-pre-wrap text-sm text-foreground')}>{display}</p>
                  {long && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-2 text-xs"
                      onClick={() => toggleExpand(note.id)}
                    >
                      {expanded ? (
                        <>
                          <ChevronUp className="mr-1 h-3 w-3" /> Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1 h-3 w-3" /> Show more
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
