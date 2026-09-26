import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  Download,
  FileDown,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Timer,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useDroitsClasseur } from '#/components/classeur/hooks/useDroitsClasseur.ts'
import { useClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import {
  useCreerPointRestauration,
  useMergeHistory,
  useRestaurerInstantane,
  useSupprimerEntree,
} from '#/components/classeur/hooks/useMerge.ts'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { telechargerTexte } from '#/lib/classeur/download.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { serialiserExport } from '#/lib/classeur/exportJson.ts'
import { formatDate } from '#/lib/classeur/naming.ts'
import {
  FENETRE_AUTO_MS,
  QUOTAS,
  estMajeur,
} from '#/lib/classeur/restauration.ts'
import { fetchMergeSnapshot } from '#/lib/classeur/service.ts'
import { sanitizeFilename } from '#/lib/classeur/slug.ts'
import type { DbMergeHistoryEntry, PointKind } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Points de restauration d'un classeur (ex « Historique des imports » de
 * Registre, élargi le 2026-09-26 — voir `lib/classeur/restauration.ts`).
 *
 * Deux familles, deux quotas : les points MINEURS, pris automatiquement
 * avant une session de modifications (un par quart d'heure au plus), et les
 * points MAJEURS : manuels (nommés ici), fusions (import JSON), sécurité
 * (avant une restauration). Chaque point se restaure (avec confirmation ;
 * un point de sécurité est pris d'abord si l'état courant diffère), se
 * télécharge en JSON, ou se supprime (majeurs : gestion seule, garde `can`
 * + RLS ; mineurs : quiconque écrit).
 *
 * « Aucun point » n'apparaît qu'après RÉUSSITE de la lecture
 * (`isPending`/`isError` d'abord) : un état vide affirmé pendant un
 * chargement est un mensonge (CLAUDE.md, squelettes 2026-09-23).
 */

const GENRES: Record<
  PointKind,
  { titre: string; icone: LucideIcon; pastille: string }
> = {
  auto: {
    titre: 'Point automatique',
    icone: Timer,
    pastille: 'bg-muted text-muted-foreground',
  },
  manuel: {
    titre: 'Point manuel',
    icone: Bookmark,
    pastille: 'bg-primary/15 text-primary',
  },
  fusion: {
    titre: 'Avant un import',
    icone: FileDown,
    pastille: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  securite: {
    titre: 'Sauvegarde de sécurité',
    icone: ShieldCheck,
    pastille: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
}

/** Libellés d'une entrée : titre, ligne de détail, compteurs à afficher. */
export function libellerEntree(
  entry: Pick<DbMergeHistoryEntry, 'kind' | 'label' | 'source_name'>,
): { titre: string; description: string; avecCompteurs: boolean } {
  switch (entry.kind) {
    case 'auto':
      return {
        titre: GENRES.auto.titre,
        description: 'Pris avant une session de modifications',
        avecCompteurs: false,
      }
    case 'manuel':
      return {
        titre: entry.label.trim() !== '' ? entry.label : GENRES.manuel.titre,
        description: GENRES.manuel.titre,
        avecCompteurs: false,
      }
    case 'fusion':
      return {
        titre: GENRES.fusion.titre,
        description: entry.source_name
          ? `Fusion depuis ${entry.source_name}`
          : 'Fusion depuis un fichier externe',
        avecCompteurs: true,
      }
    case 'securite':
      return {
        titre: GENRES.securite.titre,
        description: 'Prise automatiquement avant un retour en arrière',
        avecCompteurs: false,
      }
  }
}

function heure(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** « 12 ko », « 1,3 Mo » : le poids d'un instantané. */
export function formaterTaille(octets: number | null): string {
  if (octets === null) return ''
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`
  return `${(octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

export function HistoriqueDialog({
  open,
  onOpenChange,
  classeurId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classeurId: number
}) {
  const { canWrite, canManage } = useDroitsClasseur(classeurId)
  const historique = useMergeHistory(classeurId)
  const classeur = useClasseur(classeurId)

  const creation = useCreerPointRestauration()
  const restauration = useRestaurerInstantane()
  const suppression = useSupprimerEntree()
  const telechargement = useMutation({
    mutationFn: async (entry: DbMergeHistoryEntry) => {
      const snapshot = await fetchMergeSnapshot(entry.id)
      const { titre } = libellerEntree(entry)
      const jour = entry.merged_at.slice(0, 10)
      const nom = classeur.data?.name.trim() || 'Classeur'
      telechargerTexte(
        `${sanitizeFilename(`${nom} ${titre.toLowerCase()} ${jour}`)}.json`,
        serialiserExport(snapshot),
        'application/json;charset=utf-8',
      )
    },
  })

  const [libelle, setLibelle] = useState('')
  const [aRestaurer, setARestaurer] = useState<DbMergeHistoryEntry | null>(null)
  const [aSupprimer, setASupprimer] = useState<DbMergeHistoryEntry | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const occupe =
    creation.isPending ||
    restauration.isPending ||
    suppression.isPending ||
    telechargement.isPending
  const enCours = restauration.isPending
    ? restauration.variables
    : suppression.isPending
      ? suppression.variables
      : telechargement.isPending
        ? telechargement.variables.id
        : null

  const erreur = creation.isError
    ? messageErreur(creation.error, 'Point impossible à créer')
    : restauration.isError
      ? messageErreur(restauration.error, 'Restauration impossible')
      : suppression.isError
        ? messageErreur(suppression.error, 'Suppression impossible')
        : telechargement.isError
          ? messageErreur(telechargement.error, 'Téléchargement impossible')
          : null

  const entrees = historique.data ?? []
  const nbMineurs = entrees.filter((e) => e.kind === 'auto').length
  const nbMajeurs = entrees.length - nbMineurs
  const poidsTotal = entrees.reduce((s, e) => s + (e.taille ?? 0), 0)

  function creer() {
    setMessage(null)
    creation.mutate(
      { classeurId, label: libelle },
      {
        onSuccess: (id) => {
          setLibelle('')
          setMessage(
            id === null
              ? 'Le dernier point manuel est déjà identique à l’état actuel.'
              : 'Point de restauration créé.',
          )
        },
      },
    )
  }

  function restaurer(entry: DbMergeHistoryEntry) {
    setMessage(null)
    restauration.mutate(entry.id, {
      onSuccess: (resultat) => {
        setMessage(
          resultat === null
            ? 'Le classeur est déjà dans cet état : rien à restaurer.'
            : resultat.inserted + resultat.updated + resultat.deleted === 0
              ? 'Point restauré : seuls le nom, l’icône ou l’établissement du classeur différaient.'
              : `Point restauré : ${resultat.inserted} ajouté(s), ${resultat.updated} modifié(s), ${resultat.deleted} supprimé(s).`,
        )
      },
    })
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && occupe) return
          if (!o) setMessage(null)
          onOpenChange(o)
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Points de restauration</DialogTitle>
            <DialogDescription>
              Un point est pris automatiquement avant chaque session de
              modifications (au plus un par {FENETRE_AUTO_MS / 60_000} min), et
              avant chaque import ou restauration. Créez vos propres points
              avant une grosse modification. {QUOTAS.auto} points automatiques
              et {QUOTAS.majeur} points majeurs sont conservés par classeur.
            </DialogDescription>
          </DialogHeader>

          {canWrite && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                creer()
              }}
            >
              <Input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Nom du point (ex. avant refonte du chapitre gaz)"
                aria-label="Nom du point de restauration"
                maxLength={120}
                disabled={occupe}
              />
              <Button type="submit" variant="outline" disabled={occupe}>
                {creation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Bookmark />
                )}
                Créer un point
              </Button>
            </form>
          )}

          {erreur && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}
          {message && !erreur && (
            <Alert>
              <CheckCircle2 />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <div className="flex-1 overflow-y-auto pr-1">
            {historique.isPending ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : historique.isError ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>
                  {messageErreur(historique.error, 'Lecture impossible')}
                </AlertDescription>
              </Alert>
            ) : entrees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun point de restauration pour le moment. Le premier sera pris
                à la prochaine modification.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {entrees.map((entry) => {
                  const { titre, description, avecCompteurs } =
                    libellerEntree(entry)
                  const genre = GENRES[entry.kind]
                  const Icone = genre.icone
                  const cetteLigne = enCours === entry.id
                  const supprimable =
                    canManage || (canWrite && !estMajeur(entry.kind))
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm"
                    >
                      <Icone className="size-4 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{titre}</span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                              genre.pastille,
                            )}
                          >
                            {estMajeur(entry.kind) ? 'majeur' : 'mineur'}
                          </span>
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {description}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.merged_at)} {heure(entry.merged_at)}
                          {entry.taille !== null &&
                            ` · ${formaterTaille(entry.taille)}`}
                          {avecCompteurs && (
                            <>
                              {' · '}
                              {entry.inserted} ajouté(s), {entry.updated} mis à
                              jour, {entry.unchanged} inchangé(s)
                              {entry.skipped > 0 &&
                                `, ${entry.skipped} ignoré(s)`}
                            </>
                          )}
                        </span>
                      </div>
                      {canWrite && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={occupe}
                              onClick={() => setARestaurer(entry)}
                            >
                              {cetteLigne && restauration.isPending ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <RotateCcw />
                              )}
                              <span className="sr-only">Restaurer</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Revenir à ce point</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={occupe}
                            onClick={() => telechargement.mutate(entry)}
                          >
                            {cetteLigne && telechargement.isPending ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Download />
                            )}
                            <span className="sr-only">Télécharger</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Télécharger le JSON</TooltipContent>
                      </Tooltip>
                      {supprimable && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={occupe}
                              onClick={() => setASupprimer(entry)}
                            >
                              {cetteLigne && suppression.isPending ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Trash2 />
                              )}
                              <span className="sr-only">Supprimer</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Supprimer ce point</TooltipContent>
                        </Tooltip>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {entrees.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {nbMineurs} mineur{nbMineurs > 1 ? 's' : ''} sur {QUOTAS.auto},{' '}
              {nbMajeurs} majeur{nbMajeurs > 1 ? 's' : ''} sur {QUOTAS.majeur}
              {poidsTotal > 0 && ` · ${formaterTaille(poidsTotal)} en base`}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aRestaurer !== null}
        onOpenChange={(o) => {
          if (!o) setARestaurer(null)
        }}
        title="Revenir à ce point ?"
        description={
          aRestaurer
            ? `Le classeur reviendra à son état du ${formatDate(aRestaurer.merged_at)} ${heure(aRestaurer.merged_at)}. L'état actuel est sauvegardé d'abord s'il diffère.`
            : undefined
        }
        confirmLabel="Restaurer"
        onConfirm={() => {
          if (aRestaurer) restaurer(aRestaurer)
        }}
      />
      <ConfirmDialog
        open={aSupprimer !== null}
        onOpenChange={(o) => {
          if (!o) setASupprimer(null)
        }}
        title="Supprimer ce point ?"
        description="Il ne pourra plus être restauré ni téléchargé."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (aSupprimer) {
            setMessage(null)
            suppression.mutate(aSupprimer.id)
          }
        }}
      />
    </>
  )
}
