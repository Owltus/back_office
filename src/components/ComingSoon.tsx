import { Construction } from 'lucide-react'

export function ComingSoon() {
  return (
    <div className="empty-canvas flex min-h-[300px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border text-center text-muted-foreground">
      <Construction className="size-10 opacity-40" />
      <p className="text-sm font-medium">Page pas encore disponible</p>
    </div>
  )
}
