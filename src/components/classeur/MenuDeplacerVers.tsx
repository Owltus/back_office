import { useState } from 'react'
import type { ReactNode, SyntheticEvent } from 'react'
import { Copy, Library } from 'lucide-react'

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
import type { ModeTransfert } from '#/lib/classeur/transfert.ts'
import type { DbChapter } from '#/lib/classeur/types.ts'

/** Raison affichée quand les entrées vers un autre classeur sont grisées. */
export const AUCUNE_CIBLE = 'Aucun autre classeur où vous pouvez écrire'

export const LIBELLE_DEPLACER = 'Déplacer vers un autre classeur…'
export const LIBELLE_COPIER = 'Copier vers un autre classeur…'
/** Infobulle et nom accessible des boutons qui ouvrent ce menu. */
export const TIP_DEPLACER_COPIER = 'Déplacer ou copier…'

const arreter = (e: SyntheticEvent) => e.stopPropagation()

/**
 * Menu « Déplacer vers… » (étape 7c) — barre de sélection ET carte d'un
 * élément : les autres chapitres du classeur courant (déplacement direct,
 * inchangé), puis « Déplacer vers un autre classeur… » et « Copier vers un
 * autre classeur… », qui ouvrent `TransfertDialog` sur le mode choisi.
 *
 * Seule voie au doigt sous 1024 px (la colonne des chapitres y est un
 * tiroir) : entrées hautes de 44 px au doigt. La liste des classeurs n'est
 * lue qu'À L'OUVERTURE du menu (base Nano), pour savoir s'il existe une
 * cible ; sans cible, les deux entrées sont grisées avec leur raison.
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
  onAutreClasseur: (mode: ModeTransfert) => void
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
        <DropdownMenuLabel>Déplacer ou copier…</DropdownMenuLabel>
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
        {/* Deux entrées VISIBLES (audit utilisateur du 2026-10-04, A5) :
            « Copier » était caché derrière un sélecteur présélectionné sur
            Déplacer, l'action la plus risquée. Le choix reste modifiable
            dans le dialogue. */}
        <DropdownMenuItem
          className="pointer-coarse:min-h-11"
          disabled={raison !== null}
          onSelect={() => onAutreClasseur('deplacer')}
        >
          <Library />
          {LIBELLE_DEPLACER}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="pointer-coarse:min-h-11"
          disabled={raison !== null}
          onSelect={() => onAutreClasseur('copier')}
        >
          <Copy />
          {LIBELLE_COPIER}
        </DropdownMenuItem>
        {raison !== null && (
          <p
            className="px-2 pb-1.5 text-xs text-muted-foreground"
            data-testid="raison-autre-classeur"
          >
            {raison}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
