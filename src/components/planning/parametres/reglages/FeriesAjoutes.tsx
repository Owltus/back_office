/*
 * Jours fériés en plus (lot 1b du 2026-11-06, `planning_feries`) : une fête
 * locale, un jour chômé de l'établissement. Les 11 jours fériés de la loi
 * sont comptés d'office (`feries.ts`) ; ceux d'ici s'y ajoutent et sont
 * traités exactement comme eux (pris le jour même, rattrapés, évités pour
 * un mineur). Gestion seule.
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { EnTeteSection } from '#/components/planning/parametres/reglages/cadre.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { enregistrerFerie, supprimerFerie } from '#/lib/planning/service.ts'
import type { FerieAjoute } from '#/lib/planning/types.ts'

/** « 14/07/2027 », ou « 14/07, chaque année ». */
export function dateFerie(f: Pick<FerieAjoute, 'jour' | 'recurrent'>): string {
  const [a, m, j] = f.jour.split('-')
  return f.recurrent ? `${j}/${m}, chaque année` : `${j}/${m}/${a}`
}

/** Ce qui manque à une saisie pour l'ajouter, ou null. */
export function erreurFerie(
  v: { jour: string; nom: string },
  deja: readonly Pick<FerieAjoute, 'jour'>[],
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.jour)) return 'Choisissez une date.'
  if (!v.nom.trim()) return 'Donnez un nom au jour férié.'
  if (v.nom.trim().length > 80) return 'Le nom fait au plus 80 caractères.'
  if (deja.some((f) => f.jour === v.jour)) return 'Cette date est déjà ajoutée.'
  return null
}

export function FeriesAjoutes({
  feries,
  modifiable,
}: {
  feries: readonly FerieAjoute[]
  modifiable: boolean
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const [v, setV] = useState({ jour: '', nom: '', recurrent: true })
  const [envoi, setEnvoi] = useState(false)
  const erreur = erreurFerie(v, feries)

  const ajouter = async () => {
    if (erreur || envoi) return
    setEnvoi(true)
    const r = await ecrire(
      () => enregistrerFerie({ ...v, nom: v.nom.trim() }, null),
      "Le jour férié n'a pas pu être ajouté",
    )
    setEnvoi(false)
    if (!r.ok) {
      notifier(r.message, 'danger')
      return
    }
    notifier(`Jour férié ${v.nom.trim()} ajouté`)
    setV({ jour: '', nom: '', recurrent: true })
  }

  const retirer = async (f: FerieAjoute) => {
    setEnvoi(true)
    const r = await ecrire(
      () => supprimerFerie(f.id),
      `Le jour férié ${f.nom} n'a pas pu être retiré`,
    )
    setEnvoi(false)
    notifier(
      r.ok ? `Jour férié ${f.nom} retiré` : r.message,
      r.ok ? 'info' : 'danger',
    )
  }

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="titre-feries-ajoutes"
    >
      <EnTeteSection
        id="titre-feries-ajoutes"
        titre="Jours fériés en plus"
        texte="Les 11 jours fériés de la loi sont comptés d'office. Ajoutez ici une fête locale ou un jour chômé de l'établissement : il est traité comme les autres."
      />
      <div className="flex max-w-3xl flex-col gap-3">
        {feries.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {feries.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {f.nom}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {dateFerie(f)}
                </span>
                {modifiable && (
                  <Tip label={`Retirer ${f.nom}`}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Retirer ${f.nom}`}
                      disabled={envoi}
                      onClick={() => void retirer(f)}
                    >
                      <Trash2 />
                    </Button>
                  </Tip>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun jour férié en plus.
          </p>
        )}
        {modifiable && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Date
              <Input
                type="date"
                aria-label="Date du jour férié"
                className="w-40"
                value={v.jour}
                disabled={envoi}
                onChange={(e) => setV((x) => ({ ...x, jour: e.target.value }))}
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Nom
              <Input
                aria-label="Nom du jour férié"
                placeholder="Fête locale"
                maxLength={80}
                value={v.nom}
                disabled={envoi}
                onChange={(e) => setV((x) => ({ ...x, nom: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && void ajouter()}
              />
            </label>
            <label className="flex items-center gap-2 self-center text-sm">
              <Switch
                checked={v.recurrent}
                disabled={envoi}
                onCheckedChange={(recurrent) =>
                  setV((x) => ({ ...x, recurrent }))
                }
                aria-label="Chaque année"
              />
              Chaque année
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={!!erreur || envoi}
              onClick={() => void ajouter()}
            >
              <Plus />
              Ajouter
            </Button>
            {v.jour && v.nom && erreur && (
              <p className="w-full text-xs text-destructive">{erreur}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
