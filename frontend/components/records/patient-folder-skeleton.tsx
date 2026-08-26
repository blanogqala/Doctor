import { Skeleton } from '@/components/ui/skeleton';

export function PatientFolderSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading patient folder">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 flex-shrink-0" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export function ClinicalRecordSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading medical record">
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
