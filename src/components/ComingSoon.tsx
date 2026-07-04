import { Construction } from 'lucide-react'

import { EmptyCanvas } from '#/components/shared/EmptyCanvas.tsx'

export function ComingSoon() {
  return (
    <EmptyCanvas className="empty-canvas min-h-[300px] flex-col gap-3 text-center text-muted-foreground">
      <Construction className="size-10 opacity-40" />
      <p className="text-sm font-medium">Page pas encore disponible</p>
    </EmptyCanvas>
  )
}
