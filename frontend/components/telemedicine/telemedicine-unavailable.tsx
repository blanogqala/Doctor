'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VideoOff } from 'lucide-react';

export function TelemedicineUnavailable({ message }: { message?: string }) {
  return (
    <Alert className="border-amber-200 bg-amber-50">
      <VideoOff className="h-4 w-4 text-amber-800" />
      <AlertTitle>Virtual consultations unavailable</AlertTitle>
      <AlertDescription>
        {message ??
          'Virtual consultations are temporarily unavailable. Please try again shortly or contact the practice.'}
      </AlertDescription>
    </Alert>
  );
}
