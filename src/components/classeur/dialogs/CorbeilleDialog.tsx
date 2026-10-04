import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  FileText,
  FolderOpen,
  PenLine,
  RotateCcw,
  Table2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  chapitresDisponibles,
  construireCorbeille,
} from '#/lib/classeur/corbeille.ts'
import type { ChapitreBrut, EntreeCorbeille } from '#/lib/classeur/corbeille.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import { mentionVersion } from '#/lib/classeur/print/mentionVersion.ts'
import {
  fetchCorbeille,
  restaurerAvecChapitre,
  restaurerChapter,
  restaurerItem,
} from '#/lib/classeur/service.ts'
import { titreOuDefaut } from '#/lib/classeur/sommaire.ts'
import { ITEM_LABEL } from '#/lib/classeur/types.ts'
import type { ItemKind } from '#/lib/classeur/types.ts'

const ICONE_KIND: Record<ItemKind, LucideIcon> = {
  document: FileText,
  tracking_sheet: Table2,
  signature_sheet: PenLine,
  intercalaire: Bookmark,
}

/** Valeur du choix d'un orphelin : avec son chapitre, ou un autre chapitre. */
const AVEC_SON_CHAPITRE = 'avec-son-chapitre'

/** Ce qu'une restauration demande au service. */
type Restauration =
  | { entree: EntreeCorbeille & { type: 'chapitre' } }
  | {
      entree: EntreeCorbeille & { type: 'element' }
      /** Orphelin : chapitre d'arrivée choisi, `null` = avec son chapitre. */
      vers: number | null
    }

function majuscule(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Corbeille d'un classeur (étape 6 du plan
 * `plan/classeur-fonctions-2026-10-04/`).
 *
 * - Visible avec le droit d'ÉCRITURE sur le classeur (D16) ; le classeur
 *   entier n'y figure jamais (D17). Aucune suppression définitive ici.
 * - Lecture À L'OUVERTURE seulement (base Nano) : le corps n'est monté que
 *   dialogue ouvert, et relit à chaque ouverture.
 * - Jamais « corbeille vide » pendant le chargement ni après une erreur
 *   (`isPending`, jamais `isSuccess` seul).
 * - Restaurer remet l'élément en FIN de son chapitre (`OptionsCorbeille`) ;
 *   un élément dont le chapitre est aussi supprimé revient avec lui
 *   (chapitre d'abord) ou dans un chapitre choisi.
 */
export function CorbeilleDialog({
  open,
  onOpenChange,
  classeurId,
  canWrite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classeurId: number
  canWrite: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Corbeille</DialogTitle>
          <DialogDescription>
            Les chapitres et éléments supprimés de ce classeur. Un élément
            restauré revient à la fin de son chapitre.
          </DialogDescription>
        </DialogHeader>
        {open && <CorpsCorbeille classeurId={classeurId} canWrite={canWrite} />}
      </DialogContent>
    </Dialog>
  )
}

export function CorpsCorbeille({
  classeurId,
  canWrite,
}: {
  classeurId: number
  canWrite: boolean
}) {
  const queryClient = useQueryClient()
  const corbeilleQ = useQuery({
    queryKey: classeurKeys.corbeille(classeurId),
    queryFn: () => fetchCorbeille(classeurId),
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const entrees = useMemo(
    () => (corbeilleQ.data ? construireCorbeille(corbeilleQ.data) : []),
    [corbeilleQ.data],
  )
  const cibles = useMemo(
    () =>
      corbeilleQ.data ? chapitresDisponibles(corbeilleQ.data.chapitres) : [],
    [corbeilleQ.data],
  )
  const [restaure, setRestaure] = useState<string | null>(null)

  const restauration = useMutation({
    mutationFn: async (r: Restauration) => {
      const e = r.entree
      if (e.type === 'chapitre') {
        await restaurerChapter(e.id, {}, { classeurId })
      } else if (!e.orphelin) {
        await restaurerItem(e.kind, e.id, {}, { classeurId })
      } else if ('vers' in r && r.vers !== null) {
        await restaurerItem(e.kind, e.id, {}, { classeurId, chapterId: r.vers })
      } else {
        await restaurerAvecChapitre(classeurId, e.kind, e.id, e.chapitreId)
      }
    },
    onMutate: () => setRestaure(null),
    onSuccess: (_d, r) => setRestaure(titreOuDefaut(r.entree.titre)),
    // Succès comme échec : l'état réel est relu (un échec à mi-chemin de
    // « avec son chapitre » a pu remettre le chapitre seul).
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: classeurKeys.all }),
  })

  const enCours = restauration.isPending
    ? restauration.variables.entree.cle
    : null
  const enErreur = restauration.isError
    ? restauration.variables.entree.cle
    : null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      {restaure !== null && (
        <Alert className="mb-3">
          <CheckCircle2 />
          <AlertDescription>« {restaure} » est restauré.</AlertDescription>
        </Alert>
      )}
      {corbeilleQ.isError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(corbeilleQ.error, 'Lecture impossible')}
          </AlertDescription>
        </Alert>
      ) : corbeilleQ.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : entrees.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          La corbeille est vide : rien n'a été supprimé dans ce classeur.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entrees.map((e) => (
            <LigneCorbeille
              key={e.cle}
              entree={e}
              cibles={cibles}
              canWrite={canWrite}
              occupe={enCours !== null}
              enCours={enCours === e.cle}
              erreur={
                enErreur === e.cle
                  ? messageErreur(restauration.error, 'Restauration impossible')
                  : null
              }
              onRestaurer={(vers) =>
                restauration.mutate(
                  e.type === 'chapitre' ? { entree: e } : { entree: e, vers },
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function LigneCorbeille({
  entree: e,
  cibles,
  canWrite,
  occupe,
  enCours,
  erreur,
  onRestaurer,
}: {
  entree: EntreeCorbeille
  cibles: ReadonlyArray<ChapitreBrut>
  canWrite: boolean
  occupe: boolean
  enCours: boolean
  erreur: string | null
  onRestaurer: (vers: number | null) => void
}) {
  const orphelin = e.type === 'element' && e.orphelin
  // Un orphelin dont le chapitre a disparu ne peut revenir qu'ailleurs.
  const avecSonChapitre = e.type === 'element' && e.chapitreLabel !== null
  const [choix, setChoix] = useState<string>(() =>
    avecSonChapitre ? AVEC_SON_CHAPITRE : String(cibles.at(0)?.id ?? ''),
  )
  const Icone = e.type === 'chapitre' ? FolderOpen : ICONE_KIND[e.kind]
  const le = mentionVersion(e.deletedAt) ?? ''
  const details =
    e.type === 'chapitre'
      ? `Chapitre · ${
          e.elements === 0
            ? 'vide'
            : `${e.elements} élément${e.elements > 1 ? 's' : ''} revien${e.elements > 1 ? 'nent' : 't'} avec lui`
        }`
      : `${majuscule(ITEM_LABEL[e.kind])}${
          e.chapitreLabel !== null ? ` · ${titreOuDefaut(e.chapitreLabel)}` : ''
        }`
  const vers =
    !orphelin || choix === AVEC_SON_CHAPITRE || choix === ''
      ? null
      : Number(choix)
  const impossible = orphelin && !avecSonChapitre && vers === null

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5 text-sm"
      data-cle={e.cle}
    >
      <div className="flex items-start gap-2.5">
        <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{titreOuDefaut(e.titre)}</p>
          <p className="text-xs text-muted-foreground">{details}</p>
          <p className="text-xs text-muted-foreground">Supprimé le {le}</p>
        </div>
        {canWrite && !orphelin && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 pointer-coarse:min-h-11"
            disabled={occupe}
            onClick={() => onRestaurer(null)}
          >
            <RotateCcw />
            {enCours ? 'Restauration...' : 'Restaurer'}
          </Button>
        )}
      </div>

      {orphelin && (
        <div className="flex flex-col gap-2 pl-6.5">
          <p className="text-xs text-muted-foreground">
            {avecSonChapitre
              ? 'Son chapitre est aussi dans la corbeille.'
              : 'Son chapitre n’existe plus.'}
          </p>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={choix} onValueChange={setChoix}>
                <SelectTrigger
                  className="min-w-0 flex-1 pointer-coarse:min-h-11"
                  aria-label="Où restaurer cet élément"
                  size="sm"
                >
                  <SelectValue placeholder="Choisir un chapitre" />
                </SelectTrigger>
                <SelectContent>
                  {avecSonChapitre && (
                    <SelectItem value={AVEC_SON_CHAPITRE}>
                      Avec son chapitre « {titreOuDefaut(e.chapitreLabel ?? '')}{' '}
                      »
                    </SelectItem>
                  )}
                  {cibles.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      Dans « {titreOuDefaut(c.label)} »
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 pointer-coarse:min-h-11"
                disabled={occupe || impossible}
                onClick={() => onRestaurer(vers)}
              >
                <RotateCcw />
                {enCours
                  ? 'Restauration...'
                  : vers === null
                    ? 'Restaurer avec son chapitre'
                    : 'Restaurer'}
              </Button>
            </div>
          )}
        </div>
      )}

      {erreur !== null && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
    </li>
  )
}
