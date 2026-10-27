/*
 * Catégories du staff, en tiroir (prototype `GestionCategories`) : ajouter,
 * renommer, ranger, supprimer, et choisir les postes que chacune peut tenir.
 * Lisible par tous, modifiable par la gestion seule.
 *
 * Restreindre les postes d'une catégorie retire à ses membres les
 * compétences qu'elle ne permet plus (trigger `planning_groupes_postes`) :
 * l'écran le dit et le fait confirmer avant.
 */

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { useConfirm } from '#/components/shared/ConfirmDialog.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import {
  enregistrerGroupe,
  ordonnerGroupes,
  supprimerGroupe,
} from '#/lib/planning/service.ts'
import type { Groupe, Poste, Salarie } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

/** Compétences que perdraient les membres si la catégorie ne permettait que `permis`. */
export function competencesPerdues(
  groupeId: number,
  permis: number[],
  salaries: Salarie[],
): { personnes: number; competences: number } {
  if (permis.length === 0) return { personnes: 0, competences: 0 }
  let personnes = 0
  let competences = 0
  for (const s of salaries) {
    if (s.groupe_id !== groupeId) continue
    const n = s.competences.filter((c) => !permis.includes(c.poste_id)).length
    if (n) {
      personnes++
      competences += n
    }
  }
  return { personnes, competences }
}

export function GestionCategories({
  ouvert,
  onFermer,
  groupes,
  postes,
  salaries,
}: {
  ouvert: boolean
  onFermer: () => void
  groupes: Groupe[]
  postes: Poste[]
  salaries: Salarie[]
}) {
  const { gerer } = useDroitsPlanning()
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const { confirm, confirmDialog } = useConfirm()
  const [enCours, setEnCours] = useState(false)
  const liste = [...groupes].sort((a, b) => a.ordre - b.ordre || a.id - b.id)

  /** Une écriture à la fois ; le refus de la base en message. */
  const action = async (
    travail: () => Promise<unknown>,
    echec: string,
  ): Promise<boolean> => {
    if (enCours || !gerer) return false
    setEnCours(true)
    try {
      const r = await ecrire(travail, echec)
      if (!r.ok) notifier(r.message, 'danger')
      return r.ok
    } finally {
      setEnCours(false)
    }
  }

  const valeurs = (g: Groupe, maj: Partial<Groupe>) => ({
    nom: g.nom,
    ordre: g.ordre,
    postes_autorises: g.postes_autorises,
    ...maj,
  })

  const renommer = (g: Groupe, nom: string) => {
    const propre = nom.trim()
    if (!propre || propre === g.nom) return
    void action(
      () => enregistrerGroupe(valeurs(g, { nom: propre }), g.id),
      'Catégorie non renommée',
    )
  }

  const deplacer = (i: number, sens: -1 | 1) => {
    const ids = liste.map((g) => g.id)
    ;[ids[i], ids[i + sens]] = [ids[i + sens], ids[i]]
    void action(
      () => ordonnerGroupes(ids),
      'Ordre des catégories non enregistré',
    )
  }

  const basculerPoste = async (g: Groupe, p: Poste) => {
    const choisi = g.postes_autorises.includes(p.id)
    const permis = choisi
      ? g.postes_autorises.filter((x) => x !== p.id)
      : [...g.postes_autorises, p.id]
    const perte = competencesPerdues(g.id, permis, salaries)
    if (perte.competences > 0) {
      const ok = await confirm({
        title: `Restreindre les postes de ${g.nom} ?`,
        description: `${perte.personnes} personne${perte.personnes > 1 ? 's' : ''} de cette catégorie perd${perte.personnes > 1 ? 'ent' : ''} ${perte.competences} compétence${perte.competences > 1 ? 's' : ''} sur des postes qu'elle ne permettra plus.`,
        confirmLabel: 'Restreindre',
        destructive: true,
      })
      if (!ok) return
    }
    void action(
      () => enregistrerGroupe(valeurs(g, { postes_autorises: permis }), g.id),
      'Postes de la catégorie non enregistrés',
    )
  }

  const supprimer = async (g: Groupe) => {
    const membres = salaries.filter((s) => s.groupe_id === g.id).length
    const ok = await confirm({
      title: `Supprimer la catégorie ${g.nom} ?`,
      description: membres
        ? `Ses ${membres} membre${membres > 1 ? 's' : ''} passe${membres > 1 ? 'nt' : ''} sans catégorie. Leur fiche est gardée.`
        : 'Elle ne compte aucun membre.',
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    if (await action(() => supprimerGroupe(g.id), 'Catégorie non supprimée')) {
      notifier(
        `Catégorie ${g.nom} supprimée : ses membres passent sans catégorie`,
      )
    }
  }

  const ajouter = async () => {
    const ordre = liste.reduce((m, g) => Math.max(m, g.ordre), -1) + 1
    if (
      await action(
        () =>
          enregistrerGroupe(
            { nom: 'Nouvelle catégorie', ordre, postes_autorises: [] },
            null,
          ),
        'Catégorie non ajoutée',
      )
    ) {
      notifier('Catégorie ajoutée en dernier : renommez-la')
    }
  }

  return (
    <Sheet open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent
        showCloseButton={false}
        className="w-full gap-0 sm:max-w-xl"
      >
        <SheetHeader className="flex-row items-start justify-between gap-3 border-b">
          <div className="flex flex-col gap-1">
            <SheetTitle>Catégories du staff</SheetTitle>
            <SheetDescription>
              Rangement du planning et de l'équipe, de haut en bas
              {!gerer && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                  Lecture seule
                </span>
              )}
            </SheetDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fermer"
            onClick={onFermer}
          >
            <X />
          </Button>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs text-muted-foreground">
            Une catégorie range les personnes et dit quels postes elles peuvent
            tenir : la fiche ne propose que ceux-là (un hôtelier ne tient pas la
            direction). Aucun poste choisi : tous sont possibles. La catégorie
            de chacun se choisit dans sa fiche. Retirer un poste à une catégorie
            le retire aussi de la fiche de ses membres.
          </p>
          {liste.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune catégorie pour l'instant.
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {liste.map((g, i) => {
              const membres = salaries.filter(
                (s) => s.groupe_id === g.id,
              ).length
              return (
                <li
                  key={g.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      key={`${g.id}-${g.nom}`}
                      defaultValue={g.nom}
                      aria-label={`Nom de la catégorie ${g.nom}`}
                      disabled={!gerer}
                      maxLength={80}
                      className="h-8"
                      onBlur={(e) => renommer(g, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {membres} personne{membres > 1 ? 's' : ''}
                    </span>
                    {gerer && (
                      <>
                        <Tip label="Monter">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Monter ${g.nom}`}
                            disabled={i === 0 || enCours}
                            onClick={() => deplacer(i, -1)}
                          >
                            <ArrowUp />
                          </Button>
                        </Tip>
                        <Tip label="Descendre">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Descendre ${g.nom}`}
                            disabled={i === liste.length - 1 || enCours}
                            onClick={() => deplacer(i, 1)}
                          >
                            <ArrowDown />
                          </Button>
                        </Tip>
                        <Tip label="Supprimer la catégorie">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Supprimer ${g.nom}`}
                            disabled={enCours}
                            onClick={() => void supprimer(g)}
                          >
                            <Trash2 />
                          </Button>
                        </Tip>
                      </>
                    )}
                  </div>
                  <div
                    className="flex flex-wrap gap-1.5"
                    aria-label={`Postes autorisés pour ${g.nom}`}
                  >
                    {postes.map((p) => {
                      const choisi = g.postes_autorises.includes(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={choisi}
                          disabled={!gerer || enCours}
                          onClick={() => void basculerPoste(g, p)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60',
                            choisi
                              ? 'border-2 bg-accent text-foreground'
                              : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                          style={
                            choisi ? { borderColor: p.couleur } : undefined
                          }
                        >
                          <span
                            className="inline-block size-2.5 rounded-full"
                            style={{ background: p.couleur }}
                          />
                          {p.nom}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
          {gerer && (
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={enCours}
                onClick={() => void ajouter()}
              >
                <Plus /> Ajouter une catégorie
              </Button>
            </div>
          )}
        </div>
        <SheetFooter className="flex-row justify-end border-t">
          <Button size="sm" onClick={onFermer}>
            Terminé
          </Button>
        </SheetFooter>
        {confirmDialog}
      </SheetContent>
    </Sheet>
  )
}
