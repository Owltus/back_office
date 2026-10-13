import { CIBLE } from '#/lib/supabase.ts'
import { bandeauDe } from '#/lib/environnement.ts'

import type { Cible } from '#/lib/environnement.ts'

/**
 * Bandeau d'environnement (plan environnement-dev-docker-2026-10-12, B5) :
 * en local, un liseré ambre en haut de l'écran et une étiquette « DEV · base
 * locale », sur TOUTES les pages, `/login` compris. Rien sur le site Vercel.
 *
 * Superposé (`fixed`) et transparent aux clics : les pages en pleine hauteur
 * (Classeur, planning parking) ne bougent pas d'un pixel.
 */
export function BandeauEnvironnement({
  cible = CIBLE,
  modeDev = import.meta.env.DEV,
}: {
  cible?: Cible
  modeDev?: boolean
}) {
  // Remplacé par `return null` au build : le texte quitte le bundle.
  if (!import.meta.env.DEV) return null
  const bandeau = bandeauDe(cible, modeDev)
  if (bandeau === null) return null
  return (
    <div
      role="status"
      aria-label={bandeau.texte}
      className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex justify-center border-t-[3px] border-amber-500"
    >
      <span className="rounded-b-md bg-amber-500 px-2 pb-0.5 text-[11px] leading-4 font-semibold text-amber-950">
        {bandeau.texte}
      </span>
    </div>
  )
}
