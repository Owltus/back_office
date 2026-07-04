import { LampDesk } from 'lucide-react'

import { cn } from '#/lib/utils.ts'

export function Logo({ className }: { className?: string }) {
  return (
    <LampDesk className={cn('size-6 text-primary', className)} aria-hidden="true" />
  )
}
