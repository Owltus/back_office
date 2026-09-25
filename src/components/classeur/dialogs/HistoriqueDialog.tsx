import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { useClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import {
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
import { Skeleton } from '#/components/ui/skeleton.tsx'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip.tsx'
import { telechargerTexte } from '#/lib/classeur/download.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { serialiserExport } from '#/lib/classeur/exportJson.ts'
import { SOURCE_SAUVEGARDE } from '#/lib/classeur/merge/history.ts'
import { formatDate } from '#/lib/classeur/naming.ts'
import { fetchMergeSnapshot } from '#/lib/classeur/service.ts'
import { sanitizeFilename } from '#/lib/classeur/slug.ts'
import type { DbMergeHistoryEntry } from '#/lib/classeur/types.ts'

/*
 * Historique des imports d'un classeur — ex section « Historique des
 * imports » du `SettingsDialog` de Registre. Chaque fusion y laisse un
 * instantané ; on peut le restaurer (avec confirmation ; un instantané de
 * sécurité est pris d'abord si l'état courant diffère), le télécharger en
 * JSON, ou le supprimer (gestion seule, garde `can` + RLS).
 *
 * « Aucune sauvegarde enregistrée. » n'apparaît qu'après RÉUSSITE de la
 * lecture (`isPending`/`isError` d'abord) : un état vide affirmé pendant un
 * chargement est un mensonge (CLAUDE.md, squelettes 2026-09-23).
 */

/** Libellés d'une entrée (port de `getEntryLabel`). */
export function libellerEntree(
  entry: Pick<DbMergeHistoryEntry, 'source_name'>,
): {
  titre: string
  description: string
  avecCompteurs: boolean
} {
  if (entry.source_name === SOURCE_SAUVEGARDE) {
    return {
      titre: 'Sauvegarde',
      description: 'Sauvegarde automatique avant retour en arrière',
      avecCompteurs: false,
    }
  }
  return {
    titre: 'Import',
    description: entry.source_name
      ? `Fusion depuis ${entry.source_name}`
      : 'Fusion depuis un fichier externe',
    avecCompteurs: true,
  }
}

function heure(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
  const { can } = useAuth()
  const canManage = can('classeur', 'gestion')
  const historique = useMergeHistory(classeurId)
  const classeur = useClasseur(classeurId)

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

  const [aRestaurer, setARestaurer] = useState<DbMergeHistoryEntry | null>(null)
  const [aSupprimer, setASupprimer] = useState<DbMergeHistoryEntry | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const occupe =
    restauration.isPending || suppression.isPending || telechargement.isPending
  const enCours = restauration.isPending
    ? restauration.variables
    : suppression.isPending
      ? suppression.variables
      : telechargement.isPending
        ? telechargement.variables.id
        : null

  const erreur = restauration.isError
    ? messageErreur(restauration.error, 'Restauration impossible')
    : suppression.isError
      ? messageErreur(suppression.error, 'Suppression impossible')
      : telechargement.isError
        ? messageErreur(telechargement.error, 'Téléchargement impossible')
        : null

  function restaurer(entry: DbMergeHistoryEntry) {
    setMessage(null)
    restauration.mutate(entry.id, {
      onSuccess: (resultat) => {
        setMessage(
          resultat === null
            ? 'Le classeur est déjà dans cet état : rien à restaurer.'
            : `Sauvegarde restaurée : ${resultat.inserted} ajouté(s), ${resultat.updated} modifié(s), ${resultat.deleted} supprimé(s).`,
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
            <DialogTitle>Historique des imports</DialogTitle>
            <DialogDescription>
              Chaque import crée une sauvegarde automatique. Vous pouvez
              restaurer un état précédent ou télécharger une sauvegarde.
            </DialogDescription>
          </DialogHeader>

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
            ) : historique.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune sauvegarde enregistrée.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {historique.data.map((entry) => {
                  const { titre, description, avecCompteurs } =
                    libellerEntree(entry)
                  const cetteLigne = enCours === entry.id
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">{titre}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {description}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.merged_at)} {heure(entry.merged_at)}
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
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
                        <TooltipContent>
                          Restaurer cette sauvegarde
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
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
                      {canManage && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
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
                          <TooltipContent>
                            Supprimer cette sauvegarde
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aRestaurer !== null}
        onOpenChange={(o) => {
          if (!o) setARestaurer(null)
        }}
        title="Restaurer cette sauvegarde ?"
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
        title="Supprimer cette sauvegarde ?"
        description="Elle ne pourra plus être restaurée ni téléchargée."
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
