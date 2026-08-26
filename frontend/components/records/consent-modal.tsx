'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Mic } from 'lucide-react';

export type ConsentMode = 'consultation' | 'dictation';

interface ConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** consultation = patient present (New); dictation = doctor filling missing notes (Edit) */
  mode?: ConsentMode;
}

export function ConsentModal({
  open,
  onOpenChange,
  onConfirm,
  mode = 'consultation',
}: ConsentModalProps) {
  const [informed, setInformed] = useState(false);
  const [understands, setUnderstands] = useState(false);
  const [dictationAck, setDictationAck] = useState(false);

  const isDictation = mode === 'dictation';
  const canStart = isDictation ? dictationAck : informed && understands;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setInformed(false);
      setUnderstands(false);
      setDictationAck(false);
    }
    onOpenChange(next);
  };

  const handleStart = () => {
    if (!canStart) return;
    setInformed(false);
    setUnderstands(false);
    setDictationAck(false);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isDictation
              ? 'AI Clinical Assistant — documentation'
              : 'AI Clinical Assistant — patient consent'}
          </DialogTitle>
          <DialogDescription>
            {isDictation ? (
              <>
                Use AI Clinical Assistant to fill missing SOAP fields (patient may not be present).
                The audio and English transcript will be retained with this medical record for
                clinical documentation, accessible only to doctors. Processing may occur on servers
                outside South Africa.
              </>
            ) : (
              <>
                You are about to record this consultation with AI Clinical Assistant. The audio and
                English transcript will be retained with the medical record for clinical
                documentation, accessible only to doctors (not patients). Processing may occur on
                servers outside South Africa.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Best results in English or Afrikaans. Other South African languages may be inaccurate —
              verify every field before saving. You can also type fields manually at any time.
            </p>
          </div>

          {isDictation ? (
            <div className="flex items-start space-x-3">
              <Checkbox
                id="consent-dictation"
                checked={dictationAck}
                onCheckedChange={(v) => setDictationAck(!!v)}
              />
              <Label
                htmlFor="consent-dictation"
                className="cursor-pointer text-sm font-normal leading-snug"
              >
                I am adding clinical documentation for this record (patient may not be present).
              </Label>
            </div>
          ) : (
            <>
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="consent-informed"
                  checked={informed}
                  onCheckedChange={(v) => setInformed(!!v)}
                />
                <Label
                  htmlFor="consent-informed"
                  className="cursor-pointer text-sm font-normal leading-snug"
                >
                  Doctor confirms verbal patient consent was obtained.
                </Label>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="consent-understands"
                  checked={understands}
                  onCheckedChange={(v) => setUnderstands(!!v)}
                />
                <Label
                  htmlFor="consent-understands"
                  className="cursor-pointer text-sm font-normal leading-snug"
                >
                  Patient understands recording is for clinical documentation, may be processed
                  internationally, and will be stored with this record for doctor-only access (not
                  shared with the patient portal).
                </Label>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={!canStart}>
            <Mic className="mr-2 h-4 w-4" />
            Start Recording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
