import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Bookmark,
  FileText,
  PenLine,
  Printer,
  Table2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useClasseurContent } from '#/components/classeur/hooks/useClasseur.ts'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import { cleRef } from '#/lib/classeur/ordre.ts'
import { mentionVersion } from '#/lib/classeur/print/mentionVersion.ts'
import {
  debutJourParis,
  elementsAImprimer,
  elementsDesGroupes,
  jourParis,
  jourParisMoins,
  modifiesDepuis,
} from '#/lib/classeur/selectionImpression.ts'
import type { MotifModification } from '#/lib/classeur/selectionImpression.ts'
import {
  MAX_VERSIONS_DEPUIS,
  fetchVersionsDepuis,
} from '#/lib/classeur/service.ts'
import type { ChapterItem, ItemKind } from '#/lib/classeur/types.ts'

/** Un élément à imprimer, avec le nom de son chapitre (pied de page). */
export interface ElementAImprimer {
  item: ChapterItem
  chapterName: string
}

const ICONE_KIND: Record<ItemKind, LucideIcon> = {
  document: FileText,
  tracking_sheet: Table2,
  signature_sheet: PenLine,
  intercalaire: Bookmark,
}

/** Recul proposé à l'ouverture (D15 : choisi à chaque fois, rien n'est gardé). */
const JOURS_PAR_DEFAUT = 7

/** « v1.2 · étape ajoutée · par Marie Dupont », ou la mention d'une feuille. */
function libelleMotif(motif: MotifModification): string {
  const le = mentionVersion(motif.date) ?? ''
  if (motif.type === 'feuille') {
    return motif.nouvelle
      ? `Ajout du ${le}`
      : `Changement du ${le} : contenu, ordre ou restauration`
  }
  const parts = [
    motif.version !== '' ? `v${motif.version}` : 'Enregistré',
    motif.raison,
    `le ${le}`,
    motif.auteur !== '' ? `par ${motif.auteur}` : '',
  ]
  return parts.filter((p) => p.trim() !== '').join(' · ')
}

/**
 * « Imprimer les modifications » (étape 5 du plan
 * `plan/classeur-fonctions-2026-10-04/`) : pour remplacer dans les
 * pochettes les seules feuilles qui ont changé.
 *
 * - D15 = A : la date est choisie à chaque ouverture, préremplie à « il y a
 *   7 jours » (jour de Paris), et rien n'est mémorisé (poste partagé) — le
 *   corps n'est monté que dialogue ouvert, son état repart à zéro.
 * - Lecture des versions À L'OUVERTURE seulement (base Nano) ; le contenu
 *   du classeur vient du cache de l'accueil (même clé, rafraîchi s'il a
 *   plus de 60 s).
 * - Pendant le chargement, jamais « aucune modification » (`isPending`).
 * - Tout est coché par défaut ; « Aperçu (N) » passe la main à l'appelant,
 *   qui imprime chaque élément avec sa propre numérotation (étape 4).
 */
export function ImprimerModifiesDialog({
  open,
  onOpenChange,
  classeurId,
  onApercu,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classeurId: number
  onApercu: (elements: ElementAImprimer[], depuis: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Imprimer les modifications</DialogTitle>
          <DialogDescription>
            Les documents enregistrés et les feuilles changées depuis la date
            choisie, pour ne remplacer que ces pages dans le classeur.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CorpsModifies
            classeurId={classeurId}
            onApercu={(elements, depuis) => {
              onApercu(elements, depuis)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CorpsModifies({
  classeurId,
  onApercu,
}: {
  classeurId: number
  onApercu: (elements: ElementAImprimer[], depuis: string) => void
}) {
  const [aujourdhui] = useState(() => jourParis(Date.now()))
  const [jour, setJour] = useState(() =>
    jourParisMoins(Date.now(), JOURS_PAR_DEFAUT),
  )
  /** Clés DÉCOCHÉES : tout ce qui apparaît est coché par défaut. */
  const [decochees, setDecochees] = useState<ReadonlySet<string>>(new Set())

  const depuis = debutJourParis(jour)
  const contenuQ = useClasseurContent(classeurId)
  const versionsQ = useQuery({
    queryKey: classeurKeys.modifies(classeurId, depuis ?? ''),
    queryFn: () => fetchVersionsDepuis(classeurId, depuis ?? ''),
    // Comme `useClasseurContent` : 60 s, répété à chaque site d'appel.
    staleTime: 60_000,
    enabled: depuis !== null,
  })

  const groupes = useMemo(() => {
    if (depuis === null || !contenuQ.data || !versionsQ.data) return []
    return modifiesDepuis({
      chapters: contenuQ.data.chapters,
      content: contenuQ.data.content,
      versions: versionsQ.data,
      depuis,
    })
  }, [depuis, contenuQ.data, versionsQ.data])

  const tous = useMemo(() => elementsDesGroupes(groupes), [groupes])
  const coches = useMemo(
    () =>
      elementsAImprimer(
        tous,
        tous
          .map((it) => cleRef(it.kind, it.data.id))
          .filter((c) => !decochees.has(c)),
      ),
    [tous, decochees],
  )

  const basculer = (cle: string) =>
    setDecochees((avant) => {
      const apres = new Set(avant)
      if (apres.has(cle)) apres.delete(cle)
      else apres.add(cle)
      return apres
    })

  const enAttente =
    depuis !== null && (contenuQ.isPending || versionsQ.isPending)
  const erreur = contenuQ.isError
    ? contenuQ.error
    : versionsQ.isError
      ? versionsQ.error
      : null
  const lu = depuis !== null && contenuQ.isSuccess && versionsQ.isSuccess
  const tronque = lu && versionsQ.data.length >= MAX_VERSIONS_DEPUIS
  const dateLisible = mentionVersion(depuis ?? '') ?? ''

  function apercu() {
    if (depuis === null) return
    const noms = new Map<string, string>()
    for (const g of groupes) {
      for (const e of g.elements)
        noms.set(cleRef(e.item.kind, e.item.data.id), g.chapitre.label)
    }
    onApercu(
      coches.map((item) => ({
        item,
        chapterName: noms.get(cleRef(item.kind, item.data.id)) ?? '',
      })),
      depuis,
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="imprimer-modifies-depuis">Modifiés depuis le</Label>
        <Input
          id="imprimer-modifies-depuis"
          type="date"
          value={jour}
          max={aujourdhui}
          onChange={(e) => setJour(e.target.value)}
          className="w-auto"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {depuis === null ? (
          <p className="text-sm text-muted-foreground">Choisissez une date.</p>
        ) : erreur !== null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(erreur, 'Lecture impossible')}
            </AlertDescription>
          </Alert>
        ) : enAttente || !lu ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : groupes.length === 0 && !tronque ? (
          <p className="text-sm text-muted-foreground">
            Aucune modification depuis le {dateLisible}.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Plafond atteint : jamais « aucune modification », même si
                les versions lues ne concernent que des documents supprimés
                (les plus anciennes, celles qui manquent, pouvaient compter). */}
            {tronque && (
              <Alert>
                <AlertCircle />
                <AlertDescription>
                  Beaucoup de modifications depuis cette date : la liste peut
                  être incomplète. Choisissez une date plus récente.
                </AlertDescription>
              </Alert>
            )}
            {groupes.map((g) => (
              <section key={g.chapitre.id} className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">{g.chapitre.label}</h3>
                <ul className="flex flex-col gap-1">
                  {g.elements.map(({ item, motif }) => {
                    const cle = cleRef(item.kind, item.data.id)
                    const Icone = ICONE_KIND[item.kind]
                    return (
                      <li key={cle}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">
                          <input
                            type="checkbox"
                            checked={!decochees.has(cle)}
                            onChange={() => basculer(cle)}
                            className="mt-0.5 size-4 shrink-0 accent-primary"
                          />
                          <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {titreOuDefaut(item.data.title)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {libelleMotif(motif)}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={apercu}
          disabled={!lu || coches.length === 0}
        >
          <Printer />
          Aperçu ({lu ? coches.length : 0})
        </Button>
      </DialogFooter>
    </>
  )
}
