import { useState } from 'react'
import type { ReactNode, SyntheticEvent } from 'react'
import { Library } from 'lucide-react'

import { neDemarrePasDeGlisser } from '#/components/classeur/dnd/useCapteursClasseur.ts'
import { useClasseursCibles } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import type { DbChapter } from '#/lib/classeur/types.ts'

/** Raison affichée quand l'entrée « Vers un autre classeur… » est grisée. */
export const AUCUNE_CIBLE = 'Aucun autre classeur où vous pouvez écrire'

const arreter = (e: SyntheticEvent) => e.stopPropagation()

/**
 * Menu « Déplacer vers… » (étape 7c) — barre de sélection ET carte d'un
 * élément : les autres chapitres du classeur courant (déplacement direct,
 * inchangé), puis « Vers un autre classeur… » qui ouvre `TransfertDialog`.
 *
 * Seule voie au doigt sous 1024 px (la colonne des chapitres y est un
 * tiroir) : entrées hautes de 44 px au doigt. La liste des classeurs n'est
 * lue qu'À L'OUVERTURE du menu (base Nano), pour savoir s'il existe une
 * cible ; sans cible, l'entrée est grisée avec sa raison.
 *
 * Le contenu est rendu dans un portail, mais les événements React remontent
 * l'ARBRE : posé dans une carte, un clic ouvrirait la page de détail et un
 * appui démarrerait un glisser. Tout est donc arrêté au contenu.
 *
 * À ne monter qu'avec le droit d'écriture sur le classeur courant.
 */
export function MenuDeplacerVers({
  origineId,
  autresChapitres,
  onChapitre,
  onAutreClasseur,
  tip,
  children,
}: {
  origineId: number
  autresChapitres: readonly DbChapter[]
  onChapitre: (chapterId: number) => void
  onAutreClasseur: () => void
  /** Infobulle du déclencheur (même imbrication que les autres menus). */
  tip?: string
  /** Le déclencheur (un bouton), passé à `DropdownMenuTrigger asChild`. */
  children: ReactNode
}) {
  const [ouvert, setOuvert] = useState(false)
  const { cibles, isPending, isError } = useClasseursCibles(origineId, ouvert)
  const raison = isError
    ? 'Liste des classeurs indisponible'
    : isPending
      ? 'Recherche des classeurs…'
      : cibles.length === 0
        ? AUCUNE_CIBLE
        : null

  return (
    <DropdownMenu open={ouvert} onOpenChange={setOuvert}>
      {tip === undefined ? (
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      ) : (
        <Tip label={tip}>
          <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        </Tip>
      )}
      <DropdownMenuContent
        align="end"
        className="w-64"
        {...neDemarrePasDeGlisser}
        onClick={arreter}
        onKeyDown={arreter}
      >
        <DropdownMenuLabel>Déplacer vers…</DropdownMenuLabel>
        {autresChapitres.map((c) => (
          <DropdownMenuItem
            key={c.id}
            className="pointer-coarse:min-h-11"
            onSelect={() => onChapitre(c.id)}
          >
            <span className="truncate">{c.label}</span>
          </DropdownMenuItem>
        ))}
        {autresChapitres.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem
          className="pointer-coarse:min-h-11"
          disabled={raison !== null}
          onSelect={onAutreClasseur}
        >
          <Library />
          <span className="flex min-w-0 flex-col">
            <span>Vers un autre classeur…</span>
            {raison !== null && (
              <span className="text-xs text-muted-foreground">{raison}</span>
            )}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
