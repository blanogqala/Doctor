'use client';

import { Button, type ButtonProps } from '@/components/ui/button';
import { usePracticeAccess } from '@/lib/use-practice-access';

export function RestrictedButton({ disabled, title, ...props }: ButtonProps) {
  const { canMutate, mutationHint } = usePracticeAccess();
  return (
    <Button
      {...props}
      disabled={disabled || !canMutate}
      title={!canMutate ? mutationHint : title}
    />
  );
}
