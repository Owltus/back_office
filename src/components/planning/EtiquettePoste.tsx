/*
 * Petite étiquette d'un poste (pastille de sa couleur + nom), posée sur une
 * ligne de code quand le shift ira sur un autre poste que le métier habituel
 * de la personne. Sobre : elle se range à droite, les heures restent
 * alignées.
 */

import type { Poste } from '#/lib/planning/types.ts'

export function EtiquettePoste({
  poste,
}: {
  poste: Pick<Poste, 'nom' | 'couleur'>
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: poste.couleur }}
      />
      {poste.nom}
    </span>
  )
}
