/*
 * L'horaire spécifique (heures libres, sans horaire de la liste), en UN
 * endroit (demande utilisateur du 2026-11-03 : « un encart horaire
 * spécifique, les choses au même endroit », et le clic droit qui ouvre une
 * fenêtre pour le remplir ou le modifier). Les mêmes champs servent à
 * l'encart du volet « Modifier le shift » et à la fenêtre du clic droit
 * (semaine et mois) : début, fin, pause, le travail qui en résulte, minuit
 * en fin de journée, et le poste.
 */

import { useEffect, useId, useState } from 'react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { heures, NIVEAUX } from '#/lib/planning/affichage.ts'
import { minutes, presence } from '#/lib/planning/temps.ts'
import type { Niveau, Poste } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

export const PAUSES = [0, 15, 20, 30, 45, 60, 90]

export interface ValeursSpecifique {
  debut: string
  fin: string
  pause: number
}

/** Ce qui empêche d'enregistrer : début et fin égaux, pause trop longue. */
export function erreurSpecifique(v: ValeursSpecifique): string | null {
  if (minutes(v.debut) % 1440 === minutes(v.fin) % 1440)
    return 'Le début et la fin sont identiques : choisissez une autre heure de fin.'
  if (v.pause >= presence(v.debut, v.fin))
    return 'La pause doit être plus courte que le shift.'
  return null
}

/** Minutes de travail : la présence moins la pause. */
export const travailSpecifique = (v: ValeursSpecifique) =>
  Math.max(presence(v.debut, v.fin) - v.pause, 0)

/** Début, fin, pause, le travail, et minuit en fin de journée. */
export function ChampsHoraireSpecifique({
  valeur,
  onChange,
}: {
  valeur: ValeursSpecifique
  onChange: (v: Partial<ValeursSpecifique>) => void
}) {
  const id = useId()
  const erreur = erreurSpecifique(valeur)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-debut`}>Début</Label>
          {/* Un champ heure ne sait pas afficher « 24:00 » : il montre 00:00
              et l'interrupteur dessous dit de quel minuit il s'agit. */}
          <Input
            id={`${id}-debut`}
            type="time"
            className="w-28"
            value={valeur.debut === '24:00' ? '00:00' : valeur.debut}
            onChange={(e) =>
              e.target.value && onChange({ debut: e.target.value })
            }
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-fin`}>Fin</Label>
          <Input
            id={`${id}-fin`}
            type="time"
            className="w-28"
            value={valeur.fin}
            onChange={(e) =>
              e.target.value && onChange({ fin: e.target.value })
            }
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-pause`}>Pause</Label>
          <Select
            value={String(valeur.pause)}
            onValueChange={(v) => onChange({ pause: Number(v) })}
          >
            <SelectTrigger id={`${id}-pause`} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...PAUSES, valeur.pause])]
                .sort((x, y) => x - y)
                .map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    {p === 0 ? 'Aucune' : `${p} min`}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <span className="pb-2 text-sm text-muted-foreground tabular-nums">
          {heures(travailSpecifique(valeur))} de travail
        </span>
      </div>
      {(valeur.debut === '00:00' || valeur.debut === '24:00') && (
        <div className="flex items-start gap-2.5 pt-1">
          <Switch
            id={`${id}-minuit`}
            checked={valeur.debut === '24:00'}
            onCheckedChange={(soir) =>
              onChange({ debut: soir ? '24:00' : '00:00' })
            }
            className="mt-0.5"
          />
          <Label
            htmlFor={`${id}-minuit`}
            className="grid gap-0.5 text-sm leading-snug font-normal"
          >
            <span>
              Commence à 00:00 en fin de journée (nuit vers le lendemain)
            </span>
            <span className="text-xs text-muted-foreground">
              Activé : le shift commence à minuit à la fin de ce jour, comme une
              nuit qui démarre le soir même. Désactivé : il commence à minuit au
              tout début de ce jour.
            </span>
          </Label>
        </div>
      )}
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
    </div>
  )
}

/** Le poste de l'horaire spécifique : ceux que la personne tient (et celui
 * du shift), avec son niveau. */
export function ChoixPosteSpecifique({
  postes,
  posteId,
  niveau,
  onChange,
}: {
  postes: Poste[]
  posteId: number
  niveau: (posteId: number) => Niveau | undefined
  onChange: (posteId: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">Poste</span>
      <div role="group" aria-label="Poste" className="flex flex-wrap gap-1.5">
        {postes.map((p) => {
          const n = niveau(p.id)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={posteId === p.id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-muted',
                posteId === p.id && 'border-primary bg-primary/10',
              )}
              onClick={() => onChange(p.id)}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: p.couleur }}
              />
              {p.nom}
              <small
                className={cn(
                  'text-xs',
                  n ? 'text-muted-foreground' : 'text-muted-foreground/50',
                )}
              >
                {n ? NIVEAUX[n].libelle : 'non tenu'}
              </small>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface OuvertureSpecifique {
  /** « Prénom Nom · lundi 9 novembre ». */
  titre: string
  /** Le shift spécifique de la case (à modifier), ou un point de départ. */
  initial: ValeursSpecifique & { poste_id: number }
  /** La case a déjà un horaire spécifique : on le modifie. */
  modification: boolean
  postes: Poste[]
  niveau: (posteId: number) => Niveau | undefined
  /** Pourquoi l'horaire spécifique n'est pas permis sur ce poste ce jour-là
   * (école, repos fixé, hors contrat…), ou null. */
  interdit: (posteId: number) => string | null
  /** Aucun poste ne le permet ce jour-là : la raison (la ligne du menu est
   * grisée), sinon null. */
  ferme: string | null
}

/** La fenêtre du clic droit : remplir ou modifier un horaire spécifique. */
export function DialogHoraireSpecifique({
  ouverture,
  onValider,
  onFermer,
}: {
  ouverture: OuvertureSpecifique | null
  onValider: (v: ValeursSpecifique & { poste_id: number }) => void
  onFermer: () => void
}) {
  const [v, setV] = useState(ouverture?.initial)
  // Chaque ouverture repart des valeurs de la case.
  useEffect(() => setV(ouverture?.initial), [ouverture])
  const valeur = v ?? ouverture?.initial
  const erreur = valeur ? erreurSpecifique(valeur) : null
  const interdit =
    valeur && ouverture ? ouverture.interdit(valeur.poste_id) : null
  return (
    <Dialog open={!!ouverture} onOpenChange={(o) => !o && onFermer()}>
      {ouverture && valeur && (
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {ouverture.modification
                ? "Modifier l'horaire spécifique"
                : 'Horaire spécifique'}
            </DialogTitle>
            <DialogDescription>
              {ouverture.titre}. Des heures libres, hors des horaires de la
              liste.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ChampsHoraireSpecifique
              valeur={valeur}
              onChange={(c) => setV({ ...valeur, ...c })}
            />
            <ChoixPosteSpecifique
              postes={ouverture.postes}
              posteId={valeur.poste_id}
              niveau={ouverture.niveau}
              onChange={(poste_id) => setV({ ...valeur, poste_id })}
            />
            {interdit && (
              <p
                role="status"
                className="text-sm text-amber-600 dark:text-amber-400"
              >
                {interdit}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFermer}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={!!erreur || !!interdit}
              onClick={() => {
                onValider(valeur)
                onFermer()
              }}
            >
              {ouverture.modification ? 'Enregistrer' : 'Poser ce shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
