import { Printer } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'

/**
 * « Imprimer (N) » de la barre de sélection d'un chapitre (étape 4 du plan
 * `classeur-fonctions-2026-10-04`). Même forme que les `IconAction` voisins
 * (outline, hauteur `sm`) mais avec le compteur visible : on sait combien
 * d'éléments partent à l'impression avant d'ouvrir l'aperçu.
 *
 * Désactivé à 0 : `buildPrintHtml` lève sur un aperçu sans page. Le bouton
 * vit dans la barre du haut, hors de toute carte glissable : pas besoin de
 * `neDemarrePasDeGlisser`. Il n'existe qu'en mode sélection, donc visible au
 * doigt sans survol. Sous 640 px, le mot « Imprimer » est retiré de l'écran
 * (l'icône et le compteur restent), comme le compteur de la barre.
 */
export function BoutonImprimerSelection({
  count,
  onClick,
}: {
  count: number
  onClick: () => void
}) {
  const label = `Imprimer la sélection (${count})`
  const inactif = count === 0
  const bouton = (
    <Button
      variant="outline"
      size="sm"
      aria-label={label}
      disabled={inactif}
      onClick={onClick}
    >
      <Printer />
      <span>
        <span className="max-sm:hidden">Imprimer </span>({count})
      </span>
    </Button>
  )
  if (!inactif) return <Tip label={label}>{bouton}</Tip>
  // Bouton désactivé : enrobé pour que l'infobulle s'ouvre quand même.
  return (
    <Tip label="Cochez au moins un élément à imprimer">
      <span tabIndex={0} className="inline-flex rounded-md">
        {bouton}
      </span>
    </Tip>
  )
}
