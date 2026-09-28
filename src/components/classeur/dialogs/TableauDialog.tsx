import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Columns3, Plus, Rows3, Table, X } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { ecrireTableau, normaliser } from '#/lib/classeur/tableauMarkdown.ts'
import type { Grille } from '#/lib/classeur/tableauMarkdown.ts'

/*
 * Grille de saisie d'un tableau — amélioration n° 7 de
 * `plan/classeur-editeur-ameliorations`. Un OUTIL DE SAISIE seulement : la
 * validation rend du tableau Markdown officiel (`ecrireTableau`), rien
 * d'autre n'est stocké. Ouverte vide (nouveau tableau) ou pré-remplie avec
 * le tableau sous le curseur (modification).
 *
 * Clavier : Tab / Maj + Tab passent d'une case à l'autre (ordre natif),
 * Entrée descend d'une ligne — et en ajoute une depuis la dernière.
 */
export function TableauDialog({
  grille,
  modification,
  onAnnuler,
  onValider,
}: {
  /** `null` : fermé. */
  grille: Grille | null
  /** Vrai si l'on modifie un tableau existant (libellés). */
  modification: boolean
  onAnnuler: () => void
  onValider: (markdown: string) => void
}) {
  return (
    <Dialog
      open={grille !== null}
      onOpenChange={(open) => {
        if (!open) onAnnuler()
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        {grille && (
          <Editeur
            initiale={grille}
            modification={modification}
            onAnnuler={onAnnuler}
            onValider={onValider}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const MAX_COLONNES = 8

function Editeur({
  initiale,
  modification,
  onAnnuler,
  onValider,
}: {
  initiale: Grille
  modification: boolean
  onAnnuler: () => void
  onValider: (markdown: string) => void
}) {
  const [g, setG] = useState<Grille>(() => normaliser(initiale))
  const table = useRef<HTMLTableElement>(null)
  const nbCol = g.entete.length

  /** Case à focaliser APRÈS le rendu qui la crée (ligne ou colonne ajoutée). */
  const aFocaliser = useRef<[number, number] | null>(null)

  /** Donne le focus à une case existante (ligne -1 = en-tête). */
  const focaliser = (ligne: number, col: number) => {
    table.current
      ?.querySelector<HTMLInputElement>(
        `input[data-l="${String(ligne)}"][data-c="${String(col)}"]`,
      )
      ?.focus()
  }

  // Une case ajoutée n'existe qu'au rendu suivant : on la focalise ici,
  // jamais par une minuterie qui pourrait passer avant elle.
  useEffect(() => {
    const cible = aFocaliser.current
    if (!cible) return
    aFocaliser.current = null
    focaliser(cible[0], cible[1])
  }, [g])

  const changer = (ligne: number, col: number, valeur: string) =>
    setG((p) =>
      ligne === -1
        ? { ...p, entete: p.entete.map((c, i) => (i === col ? valeur : c)) }
        : {
            ...p,
            lignes: p.lignes.map((l, j) =>
              j === ligne ? l.map((c, i) => (i === col ? valeur : c)) : l,
            ),
          },
    )

  const ajouterLigne = (apres = g.lignes.length - 1) => {
    setG((p) => ({
      ...p,
      lignes: [
        ...p.lignes.slice(0, apres + 1),
        Array.from({ length: p.entete.length }, () => ''),
        ...p.lignes.slice(apres + 1),
      ],
    }))
    aFocaliser.current = [apres + 1, 0]
  }
  const retirerLigne = (j: number) =>
    setG((p) => ({ ...p, lignes: p.lignes.filter((_, i) => i !== j) }))
  const ajouterColonne = () => {
    if (nbCol >= MAX_COLONNES) return
    setG((p) => ({
      entete: [...p.entete, `Colonne ${String(p.entete.length + 1)}`],
      lignes: p.lignes.map((l) => [...l, '']),
      alignements: [...p.alignements, 'aucun'],
    }))
    aFocaliser.current = [-1, nbCol]
  }
  const retirerColonne = (col: number) => {
    if (nbCol <= 1) return
    setG((p) => ({
      entete: p.entete.filter((_, i) => i !== col),
      lignes: p.lignes.map((l) => l.filter((_, i) => i !== col)),
      alignements: p.alignements.filter((_, i) => i !== col),
    }))
  }

  const surTouche = (
    e: KeyboardEvent<HTMLInputElement>,
    ligne: number,
    col: number,
  ) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (ligne + 1 < g.lignes.length) focaliser(ligne + 1, col)
    else ajouterLigne(ligne === -1 ? -1 : ligne)
  }

  const apercu = ecrireTableau(g)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onValider(apercu)
      }}
      className="flex min-h-0 flex-1 flex-col gap-4"
    >
      <DialogHeader className="shrink-0">
        <DialogTitle className="flex items-center gap-2">
          <Table className="size-4" />
          {modification ? 'Modifier le tableau' : 'Nouveau tableau'}
        </DialogTitle>
        <DialogDescription>
          Remplissez les cases comme dans un tableur. Tab passe à la case
          suivante, Entrée à la ligne du dessous. La première ligne est
          l'en-tête, en gras sur la page.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <table ref={table} className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {g.entete.map((c, i) => (
                <th
                  key={i}
                  className="border-b border-border bg-muted/50 p-1 align-bottom"
                >
                  <div className="flex items-center gap-1">
                    <input
                      data-l={-1}
                      data-c={i}
                      value={c}
                      onChange={(e) => changer(-1, i, e.target.value)}
                      enterKeyHint="next"
                      onKeyDown={(e) => surTouche(e, -1, i)}
                      aria-label={`En-tête, colonne ${String(i + 1)}`}
                      className="min-w-24 flex-1 rounded-sm bg-transparent px-2 py-1.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                    {nbCol > 1 && (
                      <Tip label="Supprimer cette colonne">
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => retirerColonne(i)}
                          aria-label={`Supprimer la colonne ${String(i + 1)}`}
                          className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:p-2.5"
                        >
                          <X className="size-3.5" />
                        </button>
                      </Tip>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8 border-b border-border bg-muted/50" />
            </tr>
          </thead>
          <tbody>
            {g.lignes.map((l, j) => (
              <tr key={j} className="border-b border-border last:border-b-0">
                {l.map((c, i) => (
                  <td key={i} className="p-1">
                    <input
                      data-l={j}
                      data-c={i}
                      value={c}
                      onChange={(e) => changer(j, i, e.target.value)}
                      enterKeyHint="next"
                      onKeyDown={(e) => surTouche(e, j, i)}
                      aria-label={`Ligne ${String(j + 1)}, colonne ${String(i + 1)}`}
                      className="w-full min-w-24 rounded-sm bg-transparent px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  </td>
                ))}
                <td className="w-8 p-1 text-center">
                  <Tip label="Supprimer cette ligne">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => retirerLigne(j)}
                      aria-label={`Supprimer la ligne ${String(j + 1)}`}
                      className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:p-2.5"
                    >
                      <X className="size-3.5" />
                    </button>
                  </Tip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => ajouterLigne()}
        >
          <Plus />
          <Rows3 />
          Ligne
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={ajouterColonne}
          disabled={nbCol >= MAX_COLONNES}
        >
          <Plus />
          <Columns3 />
          Colonne
        </Button>
      </div>

      <details className="shrink-0 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          Voir le texte qui sera écrit dans le document
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/50 p-2 font-mono text-foreground">
          {apercu}
        </pre>
      </details>

      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" onClick={onAnnuler}>
          Annuler
        </Button>
        <Button type="submit">
          {modification ? 'Remplacer le tableau' : 'Insérer le tableau'}
        </Button>
      </DialogFooter>
    </form>
  )
}
