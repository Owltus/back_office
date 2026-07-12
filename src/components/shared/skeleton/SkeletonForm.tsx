import { Skeleton } from '#/components/ui/skeleton.tsx'

/*
 * Carte de formulaire en squelette — un label + un champ par ligne. Pour les pages
 * de saisie (Profil) où le formulaire se remplit après coup. Décoratif (aria-hidden).
 */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-6"
      aria-hidden="true"
    >
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="mb-4 last:mb-0">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-9 w-full rounded-md" />
        </div>
      ))}
    </div>
  )
}
