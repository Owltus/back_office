import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Loader2,
} from 'lucide-react'
import type { ReactNode, Ref } from 'react'

import { ApercuImport } from '#/components/classeur/dialogs/ApercuImport.tsx'
import type { EtatImages } from '#/components/classeur/dialogs/ApercuImport.tsx'
import { SaisieImport } from '#/components/classeur/dialogs/SaisieImport.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import type { PlanFusion } from '#/lib/classeur/merge/merge.ts'
import type { ChapitreLigne, LigneImport } from '#/lib/classeur/merge/portee.ts'
import type { InfoImage } from '#/lib/classeur/relecture.ts'
import type { SourceImport } from '#/lib/classeur/sourceImport.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Briques de l'état « aperçu » d'un import (refonte du 2026-10-20),
 * partagées par l'import d'un classeur (`MergePreviewDialog`) et celui d'un
 * chapitre ou d'un document (`EchangeJsonDialog`) : squelette pendant le
 * calcul, résumé en compteurs, note de portée, avertissements regroupés,
 * erreur de lecture, pied (Annuler, Importer au libellé stable).
 */

/** Pendant le calcul : la silhouette du résumé et de quelques lignes. */
export function SqueletteApercu() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <span className="sr-only">Lecture en cours…</span>
      <div className="flex gap-2">
        <Skeleton className="h-14 flex-1 rounded-lg" />
        <Skeleton className="h-14 flex-1 rounded-lg" />
        <Skeleton className="h-14 flex-1 rounded-lg" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  )
}

interface Compteur {
  cle: string
  nombre: number
  libelle: string
  ton: 'primary' | 'neutre' | 'attenue'
}

function accorde(n: number, singulier: string, pluriel: string): string {
  return n > 1 ? pluriel : singulier
}

/**
 * Compteurs du résumé : ce que fera l'import RETENU (refus décomptés), ce
 * qui ne bouge pas, et ce que la personne a écarté.
 */
export function compteursImport(
  brut: PlanFusion,
  retenu: PlanFusion,
  ecartes: number,
): Compteur[] {
  const r = retenu.resultat
  const liste: Compteur[] = [
    {
      cle: 'ajout',
      nombre: r.inserted,
      libelle: accorde(r.inserted, 'ajouté', 'ajoutés'),
      ton: 'primary',
    },
    {
      cle: 'modif',
      nombre: r.updated,
      libelle: accorde(r.updated, 'modifié', 'modifiés'),
      ton: 'primary',
    },
    {
      cle: 'corbeille',
      nombre: r.deleted,
      libelle: 'à la corbeille',
      ton: 'primary',
    },
    {
      cle: 'inchange',
      nombre: brut.resultat.unchanged,
      libelle: accorde(brut.resultat.unchanged, 'inchangé', 'inchangés'),
      ton: 'neutre',
    },
    {
      cle: 'ignore',
      nombre: brut.resultat.skipped,
      libelle: accorde(brut.resultat.skipped, 'ignoré', 'ignorés'),
      ton: 'attenue',
    },
    {
      cle: 'ecarte',
      nombre: ecartes,
      libelle: accorde(ecartes, 'non importé', 'non importés'),
      ton: 'attenue',
    },
  ]
  return liste.filter((c) => c.nombre > 0)
}

export const LIBELLE_RESUME = 'Résumé de l’import'

export function ResumeImport({ compteurs }: { compteurs: Compteur[] }) {
  return (
    <div aria-live="polite">
      <ul
        aria-label={LIBELLE_RESUME}
        className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap"
      >
        {compteurs.map((c) => (
          <li
            key={c.cle}
            className={cn(
              'flex min-w-0 flex-col rounded-lg border px-2.5 py-1.5 sm:min-w-28 sm:flex-1 sm:px-3 sm:py-2',
              c.ton === 'primary' && 'border-primary/30 bg-primary/10',
              c.ton === 'neutre' && 'bg-muted/40',
              c.ton === 'attenue' && 'border-dashed text-muted-foreground',
            )}
          >
            <span className="text-xl font-semibold leading-tight tabular-nums">
              {c.nombre}
            </span>{' '}
            <span className="text-xs leading-tight break-words text-muted-foreground">
              {c.libelle}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** « Ce fichier concerne le chapitre X… » : un bandeau discret. */
export function NoteImport({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/** Un avertissement en clair ; plusieurs, regroupés et repliables. */
export function AvertissementsImport({
  avertissements,
}: {
  avertissements: readonly string[]
}) {
  if (avertissements.length === 0) return null
  if (avertissements.length === 1)
    return (
      <Alert>
        <AlertTriangle />
        <AlertDescription>{avertissements[0]}</AlertDescription>
      </Alert>
    )
  return (
    <details className="group rounded-lg border">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <AlertTriangle
          className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <span className="flex-1">{avertissements.length} points à savoir</span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
      </summary>
      <ul className="flex flex-col gap-1 border-t px-3 py-2 pl-9 text-sm text-muted-foreground">
        {avertissements.map((w) => (
          <li key={w} className="list-disc">
            {w}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Le fichier ne change rien. */
export function RienAImporter({ dejaAJour }: { dejaAJour: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 px-4 py-8 text-center">
      <CheckCircle2 className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">
        {dejaAJour ? 'Tout est déjà à jour.' : 'Rien à importer.'}
      </p>
      <p className="text-xs text-muted-foreground">
        Ce fichier ne change rien.
      </p>
    </div>
  )
}

export function ErreurImport({
  erreur,
  action,
}: {
  erreur: unknown
  action: string
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{messageErreur(erreur, action)}</AlertDescription>
    </Alert>
  )
}

/**
 * Pied du dialogue : Annuler (ou Fermer) et Importer, au libellé STABLE. Le
 * nombre d'éléments retenus est un badge ; le nom accessible dit tout
 * (« Importer 3 documents »). Sous les boutons, une ligne : le point de
 * restauration quand l'import est possible, sinon la raison s'il y en a une.
 */
export function PiedImport({
  libelleFermer = 'Annuler',
  onFermer,
  fermerDesactive,
  afficherImporter = true,
  onImporter,
  importerActif,
  enCours,
  badge,
  nomAccessible,
  ligne,
}: {
  libelleFermer?: string
  onFermer: () => void
  fermerDesactive: boolean
  afficherImporter?: boolean
  onImporter: () => void
  importerActif: boolean
  enCours: boolean
  /** Nombre affiché dans le bouton ; `null` : aucun badge. */
  badge: number | null
  nomAccessible: string
  /** Point de restauration, ou raison du bouton désactivé. */
  ligne: string | null
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p
        aria-live="polite"
        className="order-2 min-h-4 text-xs text-muted-foreground sm:order-1"
      >
        {ligne}
      </p>
      <div className="order-1 flex justify-end gap-2 sm:order-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 sm:flex-none"
          onClick={onFermer}
          disabled={fermerDesactive}
        >
          {libelleFermer}
        </Button>
        {afficherImporter && (
          <Button
            type="button"
            className="h-10 flex-1 sm:flex-none"
            onClick={onImporter}
            disabled={!importerActif || enCours}
            aria-label={nomAccessible}
          >
            {enCours && <Loader2 className="animate-spin" />}
            Importer
            {badge !== null && badge > 0 && (
              <span
                aria-hidden
                className="ml-0.5 min-w-5 rounded-full bg-primary-foreground/20 px-1.5 text-xs tabular-nums"
              >
                {badge}
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Ce que le calcul de l'aperçu a rendu (`previsualiserImport`). */
export interface DonneesApercu {
  plan: PlanFusion
  lignes: readonly LigneImport[]
  chapitres?: readonly ChapitreLigne[]
  note: string | null
  /** Éléments changés dans l'application depuis l'export (proposés refusés). */
  changesDepuisExport?: readonly string[]
}

/** Note au-dessus de l'aperçu quand des éléments ont changé depuis l'export. */
export function noteDepuisExport(n: number): string | null {
  if (n === 0) return null
  return n > 1
    ? `${String(n)} éléments ont changé dans l'application depuis l'export. Ils ne sont pas importés, pour garder ces changements. Cochez-les pour prendre quand même la version du fichier.`
    : "1 élément a changé dans l'application depuis l'export. Il n'est pas importé, pour garder ce changement. Cochez-le pour prendre quand même la version du fichier."
}

/**
 * Corps d'un import : la saisie (grande zone, ou ligne repliée), puis
 * l'erreur de lecture, le squelette pendant le calcul, ou l'aperçu (résumé,
 * note, avertissements, et la liste, seule à défiler).
 */
export function CorpsImport({
  source,
  onSource,
  saisieDesactivee,
  enCalcul,
  erreur,
  donnees,
  planRetenu,
  ecartes,
  refuses,
  onBasculerRefus,
  ouvertes,
  onOuvertes,
  apercuDesactive,
  images,
  etatImages,
  groupeParChapitre,
  apercuRef,
}: {
  source: SourceImport | null
  onSource: (source: SourceImport | null) => void
  saisieDesactivee: boolean
  enCalcul: boolean
  /** Erreur de lecture : la grande zone revient pour réessayer. */
  erreur: unknown
  donnees: DonneesApercu | undefined
  planRetenu: PlanFusion | null
  ecartes: number
  refuses: ReadonlySet<string>
  onBasculerRefus: (cle: string) => void
  ouvertes: ReadonlySet<string>
  onOuvertes: (ouvertes: ReadonlySet<string>) => void
  apercuDesactive: boolean
  images: ReadonlyMap<string, InfoImage> | null
  etatImages: EtatImages
  groupeParChapitre: boolean
  apercuRef?: Ref<HTMLDivElement>
}) {
  const enErreur = source !== null && erreur != null && !enCalcul
  const apercu = source !== null && !enCalcul && !enErreur ? donnees : undefined
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SaisieImport
        source={enErreur ? null : source}
        onSource={onSource}
        disabled={saisieDesactivee}
      />
      {enErreur && <ErreurImport erreur={erreur} action="Lecture impossible" />}
      {source !== null && enCalcul && <SqueletteApercu />}
      {apercu !== undefined && (
        <div
          ref={apercuRef}
          className="flex min-h-0 flex-1 scroll-mt-4 flex-col gap-3"
        >
          {apercu.lignes.length === 0 ? (
            <RienAImporter dejaAJour={apercu.plan.resultat.unchanged > 0} />
          ) : (
            <ResumeImport
              compteurs={compteursImport(
                apercu.plan,
                planRetenu ?? apercu.plan,
                ecartes,
              )}
            />
          )}
          {apercu.note != null && <NoteImport>{apercu.note}</NoteImport>}
          {(apercu.changesDepuisExport?.length ?? 0) > 0 && (
            <NoteImport>
              {noteDepuisExport(apercu.changesDepuisExport?.length ?? 0)}
            </NoteImport>
          )}
          <AvertissementsImport avertissements={apercu.plan.warnings} />
          {apercu.lignes.length > 0 && (
            <div className="-mr-1 min-h-32 flex-1 overflow-y-auto pr-1">
              <ApercuImport
                lignes={apercu.lignes}
                chapitres={groupeParChapitre ? apercu.chapitres : undefined}
                refuses={refuses}
                onBasculerRefus={onBasculerRefus}
                ouvertes={ouvertes}
                onOuvertes={onOuvertes}
                disabled={apercuDesactive}
                images={images}
                etatImages={etatImages}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const LIGNE_RESTAURATION = 'Un point de restauration est pris avant.'

/** Badge, nom accessible et ligne du pied, selon l'état de l'aperçu. */
export function etatBoutonImport({
  pret,
  aDesChangements,
  nbLignes,
  retenus,
  nom,
  noms,
  libelleSansElement,
}: {
  /** Aperçu calculé et à jour. */
  pret: boolean
  aDesChangements: boolean
  nbLignes: number
  retenus: number
  nom: string
  noms: string
  /** Nom du bouton quand seuls des chapitres changent. */
  libelleSansElement: string
}): { badge: number | null; nomAccessible: string; ligne: string | null } {
  if (!pret) return { badge: null, nomAccessible: 'Importer', ligne: null }
  if (aDesChangements)
    return {
      badge: retenus > 0 ? retenus : null,
      nomAccessible:
        retenus > 0
          ? `Importer ${String(retenus)} ${retenus > 1 ? noms : nom}`
          : libelleSansElement,
      ligne: LIGNE_RESTAURATION,
    }
  return {
    badge: null,
    nomAccessible: 'Importer',
    ligne: nbLignes > 0 ? 'Rien à importer : tout est ignoré.' : null,
  }
}
