import { useMemo, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

import {
  useChapters,
  useTransfererItems,
} from '#/components/classeur/hooks/useClasseur.ts'
import { useClasseursCibles } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { AUCUNE_CIBLE } from '#/components/classeur/MenuDeplacerVers.tsx'
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
import { Skeleton } from '#/components/ui/skeleton.tsx'
import type { NiveauEffectif } from '#/lib/classeur/droits.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { imagesATransferer } from '#/lib/classeur/transfert.ts'
import type { ModeTransfert } from '#/lib/classeur/transfert.ts'
import type { ResultatTransfert } from '#/lib/classeur/transfertExecution.ts'
import type {
  ChapterItem,
  DbChapter,
  DbClasseur,
} from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/** Ce que le dialogue rend au parent après un transfert réussi. */
export interface TransfertReussi {
  resultat: ResultatTransfert
  classeur: DbClasseur
  chapitre: DbChapter
}

const pluriel = (n: number, un: string, plusieurs: string) =>
  `${String(n)} ${n > 1 ? plusieurs : un}`

/**
 * Le résumé avant validation, PROPRE AU MODE (audit utilisateur du
 * 2026-10-04, C2 : un déplacement annonçait « aucune image à copier ») :
 * « 3 éléments seront déplacés vers le classeur X, chapitre Y. 2 images
 * seront copiées dans le classeur d'arrivée. L'historique suit chaque
 * document. » `images === null` : nombre inconnu, phrase générique.
 * Ponctuation simple (ni guillemets ni tiret cadratin dans un message,
 * règle `ux-messages-hotelier`).
 */
export function resumeTransfert(
  mode: ModeTransfert,
  nbElements: number,
  images: number | null,
  classeur: string,
  chapitre: string | null,
): string {
  const copie = mode === 'copier'
  const verbe = nbElements > 1 ? 'seront' : 'sera'
  const participe = `${copie ? 'copié' : 'déplacé'}${nbElements > 1 ? 's' : ''}`
  const vers = `vers le classeur ${classeur}${chapitre !== null ? `, chapitre ${chapitre}` : ''}`
  const phrases = [
    `${pluriel(nbElements, 'élément', 'éléments')} ${verbe} ${participe} ${vers}.`,
  ]
  if (images === null) {
    phrases.push(
      copie
        ? 'Les images utilisées seront copiées avec eux.'
        : "Les images utilisées seront copiées dans le classeur d'arrivée si besoin.",
    )
  } else if (images > 0) {
    phrases.push(
      `${pluriel(images, 'image sera copiée', 'images seront copiées')} ${copie ? 'avec eux' : "dans le classeur d'arrivée"}.`,
    )
  } else if (copie) {
    phrases.push('Aucune image à copier.')
  }
  if (!copie) phrases.push("L'historique suit chaque document.")
  return phrases.join(' ')
}

/**
 * Confirmation après succès : « 3 éléments déplacés vers le classeur X,
 * chapitre Y (2 images copiées). » puis, s'il y en a, les images introuvables.
 */
export function messageTransfert({
  resultat,
  classeur,
  chapitre,
}: TransfertReussi): string {
  const copie = resultat.mode === 'copier'
  const n = copie ? resultat.copies : resultat.deplaces
  const s = (k: number) => (k > 1 ? 's' : '')
  const nbImages = resultat.imagesCopiees
  const images =
    nbImages > 0
      ? ` (${pluriel(nbImages, 'image copiée', 'images copiées')})`
      : ''
  const nbPerdues = resultat.introuvables.length
  const perdues =
    nbPerdues === 0
      ? ''
      : nbPerdues > 1
        ? ` ${String(nbPerdues)} images introuvables n’ont pas été copiées.`
        : ' 1 image introuvable n’a pas été copiée.'
  return `${String(n)} élément${s(n)} ${copie ? 'copié' : 'déplacé'}${s(n)} vers le classeur ${classeur.name}, chapitre ${chapitre.label}${images}.${perdues}`
}

/**
 * Transfert vers un AUTRE classeur (étape 7c du plan
 * `plan/classeur-fonctions-2026-10-04/`) : classeur (seulement ceux où l'on
 * peut écrire, `classeursCibles`), puis chapitre, puis Déplacer ou Copier
 * (D18), résumé, validation. Lectures à l'ouverture seulement (base Nano) ;
 * l'exécution est celle de l'étape 7b (`transfererItems`), qui relit tout
 * frais et revérifie les droits des deux côtés (D6).
 */
export function TransfertDialog({
  open,
  onOpenChange,
  origineId,
  elements,
  modeInitial = 'deplacer',
  niveauOrigine,
  onTransfere,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  origineId: number
  /** Éléments à transférer, dans l'ordre du chapitre. */
  elements: readonly ChapterItem[]
  /** Mode choisi dans le menu (entrée Déplacer ou Copier), modifiable ici. */
  modeInitial?: ModeTransfert
  niveauOrigine: NiveauEffectif
  onTransfere: (r: TransfertReussi) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Pied FIXE, seule la zone centrale défile (audit du 2026-10-04,
          B2 : à 735 px de haut, Annuler et Déplacer sortaient de l'écran,
          sous deux défilements imbriqués). */}
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        {open && (
          <Contenu
            origineId={origineId}
            elements={elements}
            modeInitial={modeInitial}
            niveauOrigine={niveauOrigine}
            onTransfere={(r) => {
              onTransfere(r)
              onOpenChange(false)
            }}
            onAnnuler={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Contenu({
  origineId,
  elements,
  modeInitial,
  niveauOrigine,
  onTransfere,
  onAnnuler,
}: {
  origineId: number
  elements: readonly ChapterItem[]
  modeInitial: ModeTransfert
  niveauOrigine: NiveauEffectif
  onTransfere: (r: TransfertReussi) => void
  onAnnuler: () => void
}) {
  const cibles = useClasseursCibles(origineId, true)
  const [classeurId, setClasseurId] = useState<number | null>(null)
  const [chapitreId, setChapitreId] = useState<number | null>(null)
  // Monté à chaque ouverture (`open &&`) : repart du mode du menu.
  const [mode, setMode] = useState<ModeTransfert>(modeInitial)
  const classeur = cibles.cibles.find((c) => c.id === classeurId) ?? null
  const chapitres = useChapters(classeur?.id ?? Number.NaN, classeur !== null)
  const chapitre =
    (chapitres.data ?? []).find((c) => c.id === chapitreId) ?? null
  const transfert = useTransfererItems()

  const images = useMemo(() => {
    const documents = elements.flatMap((e) =>
      e.kind === 'document' ? [e.data] : [],
    )
    // Contenu absent (élément partiel) : nombre inconnu, phrase générique.
    if (documents.some((d) => typeof d.content !== 'string')) return null
    return imagesATransferer(documents, origineId).length
  }, [elements, origineId])

  const occupe = transfert.isPending
  const pret = classeur !== null && chapitre !== null && elements.length > 0
  const verbe = mode === 'copier' ? 'Copier' : 'Déplacer'

  const valider = () => {
    if (!classeur || !chapitre) return
    transfert.mutate(
      {
        mode,
        elements: elements.map((e) => ({ kind: e.kind, id: e.data.id })),
        origine: origineId,
        arrivee: classeur.id,
        chapitreArrivee: chapitre.id,
        niveaux: { origine: niveauOrigine, arrivee: cibles.niveauDe(classeur) },
      },
      {
        onSuccess: (resultat) => onTransfere({ resultat, classeur, chapitre }),
      },
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {mode === 'copier' ? 'Copier' : 'Déplacer'} vers un autre classeur
        </DialogTitle>
        <DialogDescription>
          {pluriel(
            elements.length,
            'élément sélectionné',
            'éléments sélectionnés',
          )}
          . Choisissez le classeur, puis le chapitre d'arrivée.
        </DialogDescription>
      </DialogHeader>

      {/* La SEULE zone qui défile : les listes n'ont pas de hauteur propre
          (un second défilement dans le premier, au doigt, piégeait). */}
      <div
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1"
        data-testid="transfert-defilement"
      >
        <fieldset className="flex flex-col gap-2" disabled={occupe}>
          <legend className="mb-2 text-sm font-medium">Classeur</legend>
          {cibles.isError ? (
            <p className="text-sm text-destructive">
              {messageErreur(cibles.error, 'Liste des classeurs indisponible')}
            </p>
          ) : cibles.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : cibles.cibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{AUCUNE_CIBLE}.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {cibles.cibles.map((c) => (
                <Choix
                  key={c.id}
                  name="transfert-classeur"
                  checked={classeurId === c.id}
                  onChange={() => {
                    setClasseurId(c.id)
                    setChapitreId(null)
                  }}
                >
                  {c.name}
                </Choix>
              ))}
            </div>
          )}
        </fieldset>

        {classeur && (
          <fieldset className="flex flex-col gap-2" disabled={occupe}>
            <legend className="mb-2 text-sm font-medium">Chapitre</legend>
            {chapitres.isError ? (
              <p className="text-sm text-destructive">
                {messageErreur(chapitres.error, 'Chapitres indisponibles')}
              </p>
            ) : chapitres.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : chapitres.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ce classeur n'a aucun chapitre : créez-en un d'abord.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {chapitres.data.map((c) => (
                  <Choix
                    key={c.id}
                    name="transfert-chapitre"
                    checked={chapitreId === c.id}
                    onChange={() => setChapitreId(c.id)}
                  >
                    {c.label}
                  </Choix>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <fieldset disabled={occupe}>
          <legend className="mb-2 text-sm font-medium">Action</legend>
          {/* Segment : deux boutons radio côte à côte. */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
            {(['deplacer', 'copier'] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  'flex min-h-9 cursor-pointer items-center justify-center rounded-md text-sm transition-colors pointer-coarse:min-h-11 has-focus-visible:ring-2 has-focus-visible:ring-ring',
                  mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="transfert-mode"
                  className="sr-only"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {m === 'copier' ? 'Copier' : 'Déplacer'}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {mode === 'copier'
              ? 'Les originaux restent ici ; les copies repartent en version 1.0.'
              : "Les éléments quittent ce chapitre. L'historique des versions suit chaque document déplacé."}
          </p>
        </fieldset>

        {classeur && (
          <p
            role="status"
            className="rounded-lg bg-muted px-3 py-2 text-sm"
            data-testid="resume-transfert"
          >
            {resumeTransfert(
              mode,
              elements.length,
              images,
              classeur.name,
              chapitre?.label ?? null,
            )}
          </p>
        )}

        {transfert.isError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {messageErreur(
                transfert.error,
                mode === 'copier'
                  ? 'Copie impossible'
                  : 'Déplacement impossible',
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onAnnuler} disabled={occupe}>
          Annuler
        </Button>
        <Button onClick={valider} disabled={!pret || occupe}>
          {occupe && <Loader2 className="animate-spin" />}
          {occupe ? (mode === 'copier' ? 'Copie…' : 'Déplacement…') : verbe}
        </Button>
      </DialogFooter>
    </div>
  )
}

/** Une ligne de choix (bouton radio natif), 44 px au doigt. */
function Choix({
  name,
  checked,
  onChange,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm transition-colors pointer-coarse:min-h-11',
        checked
          ? 'border-primary bg-primary/5'
          : 'border-border hover:bg-muted',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      <span className="truncate">{children}</span>
    </label>
  )
}
