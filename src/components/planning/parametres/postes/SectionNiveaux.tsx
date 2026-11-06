/*
 * Les niveaux de l'établissement (2026-11-06, lot 2, A7) : créer, renommer,
 * ranger, retirer un niveau, et ses deux cases. Le planning préfère le
 * premier niveau ; une personne a un niveau par poste dans sa fiche ; un
 * besoin peut demander un nombre par niveau. Gestion seule (la base le
 * garde aussi).
 */

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { lireNiveaux } from '#/lib/planning/niveaux.ts'
import {
  ajouterNiveau,
  enregistrerNiveau,
  ordonnerNiveaux,
  supprimerNiveau,
} from '#/lib/planning/service.ts'
import type { NiveauEtab, Referentiel } from '#/lib/planning/types.ts'

/** Une clé neuve, jamais celle d'un niveau existant (`niveau_1`, …). */
export function cleNiveauNeuve(existants: readonly { id: string }[]): string {
  const pris = new Set(existants.map((n) => n.id))
  let i = 1
  while (pris.has(`niveau_${i}`)) i++
  return `niveau_${i}`
}

/** Qui utilise ce niveau : les fiches (un poste au moins) et les besoins. */
export function usagesNiveau(
  r: Pick<Referentiel, 'salaries' | 'besoins'>,
  id: string,
): { personnes: number; besoins: number } {
  return {
    personnes: r.salaries.filter((s) =>
      s.competences.some((c) => c.niveau === id),
    ).length,
    besoins: r.besoins.filter(
      (b) =>
        b.niveau_min === id || (b.niveaux ?? []).some((l) => l.niveau === id),
    ).length,
  }
}

/** Ce qu'il faut savoir avant qu'un niveau cesse de tenir une place seul
 * (relecture du 2026-11-06) : les besoins qui le demandent n'auront plus que
 * des places de soutien. Null : aucun besoin ne le demande. */
export function avertissementNiveau(
  r: Pick<Referentiel, 'salaries' | 'besoins'>,
  id: string,
  nom: string,
): string | null {
  const n = r.besoins.filter((b) =>
    (b.niveaux ?? []).some((l) => l.niveau === id && l.nombre > 0),
  ).length
  if (!n) return null
  return `${n} besoin${n > 1 ? 's demandent' : ' demande'} le niveau ${nom}. S'il ne tient plus une place seul, ces places deviennent des places de soutien. Voir À vérifier.`
}

export function SectionNiveaux({
  referentiel,
  modifiable,
}: {
  referentiel: Referentiel
  modifiable: boolean
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const [nom, setNom] = useState('')
  const [noms, setNoms] = useState<Record<string, string>>({})
  const [envoi, setEnvoi] = useState(false)
  const niveaux = lireNiveaux(referentiel.niveaux).liste
  const off = !modifiable || envoi
  const autonomes = niveaux.filter((n) => n.autonome).length

  const agir = async (action: () => Promise<void>, echec: string) => {
    if (off) return false
    setEnvoi(true)
    const r = await ecrire(action, echec)
    setEnvoi(false)
    if (!r.ok) notifier(r.message, 'danger')
    return r.ok
  }

  const ajouter = async () => {
    const n = nom.trim()
    if (!n || niveaux.some((x) => x.nom.toLowerCase() === n.toLowerCase()))
      return
    const neuf: NiveauEtab = {
      id: cleNiveauNeuve(niveaux),
      nom: n,
      ordre: Math.max(-1, ...niveaux.map((x) => x.ordre)) + 1,
      autonome: true,
      jamais_seul: false,
    }
    const ok = await agir(
      () => ajouterNiveau(neuf),
      "Le niveau n'a pas pu être créé",
    )
    if (ok) setNom('')
  }

  const renommer = (x: NiveauEtab) => {
    const n = (noms[x.id] ?? x.nom).trim()
    if (!n || n === x.nom) return
    void agir(
      () => enregistrerNiveau(x.id, { nom: n }),
      "Le niveau n'a pas pu être renommé",
    )
  }

  const deplacer = (i: number, sens: -1 | 1) => {
    const ids = niveaux.map((x) => x.id)
    ;[ids[i], ids[i + sens]] = [ids[i + sens], ids[i]]
    void agir(
      () => ordonnerNiveaux(ids),
      "L'ordre des niveaux n'a pas pu être enregistré",
    )
  }

  const regler = (x: NiveauEtab, champs: Partial<NiveauEtab>) =>
    void agir(
      () => enregistrerNiveau(x.id, champs),
      "Le niveau n'a pas pu être enregistré",
    )

  return (
    <section
      id="postes-niveaux"
      aria-labelledby="titre-niveaux"
      className="flex flex-col gap-3"
    >
      <h3 id="titre-niveaux" className="text-base font-semibold">
        Niveaux
      </h3>
      <p className="text-sm text-muted-foreground">
        Le niveau d'une personne sur un poste se choisit dans sa fiche. Le
        planning préfère le premier niveau de la liste, puis le suivant. Peut
        tenir seul : la personne tient une place sans personne à côté. Jamais
        seul : toujours avec une personne qui tient la place seule.
      </p>
      <ul
        className="flex flex-col gap-2"
        aria-label="Niveaux de l'établissement"
      >
        {niveaux.map((x, i) => {
          const u = usagesNiveau(referentiel, x.id)
          const utilise = u.personnes + u.besoins > 0
          const dernierAutonome = x.autonome && autonomes === 1
          return (
            <li
              key={x.id}
              aria-label={x.nom}
              className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm"
            >
              <Input
                aria-label={`Nom du niveau ${x.nom}`}
                value={noms[x.id] ?? x.nom}
                maxLength={40}
                disabled={off}
                onChange={(e) =>
                  setNoms((m) => ({ ...m, [x.id]: e.target.value }))
                }
                onBlur={() => renommer(x)}
                onKeyDown={(e) => e.key === 'Enter' && renommer(x)}
                className="h-7 w-40"
              />
              <label className="flex items-center gap-1.5">
                <Switch
                  checked={x.autonome}
                  disabled={off || dernierAutonome}
                  aria-label={`${x.nom} peut tenir seul`}
                  onCheckedChange={(v: boolean) => {
                    const avis = v
                      ? null
                      : avertissementNiveau(referentiel, x.id, x.nom)
                    void agir(
                      () => enregistrerNiveau(x.id, { autonome: v }),
                      "Le niveau n'a pas pu être enregistré",
                    ).then((ok) => ok && avis && notifier(avis, 'attention'))
                  }}
                />
                Peut tenir seul
              </label>
              <label className="flex items-center gap-1.5">
                <Switch
                  checked={x.jamais_seul}
                  disabled={off}
                  aria-label={`${x.nom} jamais seul`}
                  onCheckedChange={(v: boolean) =>
                    regler(x, { jamais_seul: v })
                  }
                />
                Jamais seul
              </label>
              <span className="text-xs text-muted-foreground">
                {u.personnes
                  ? `${u.personnes} personne${u.personnes > 1 ? 's' : ''}`
                  : 'Personne'}
              </span>
              {modifiable && (
                <span className="ml-auto flex items-center gap-0.5">
                  <Tip label={`Monter ${x.nom}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Monter ${x.nom}`}
                      disabled={off || i === 0}
                      onClick={() => deplacer(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                  </Tip>
                  <Tip label={`Descendre ${x.nom}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Descendre ${x.nom}`}
                      disabled={off || i === niveaux.length - 1}
                      onClick={() => deplacer(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </Tip>
                  <Tip
                    label={
                      utilise
                        ? 'Utilisé par une fiche ou un besoin.'
                        : dernierAutonome
                          ? 'Il faut un niveau qui tient une place seul.'
                          : `Retirer ${x.nom}`
                    }
                  >
                    <span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Retirer le niveau ${x.nom}`}
                        disabled={off || utilise || dernierAutonome}
                        onClick={() =>
                          void agir(
                            () => supprimerNiveau(x.id),
                            "Le niveau n'a pas pu être retiré",
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </Tip>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {modifiable && (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Nom du nouveau niveau"
            placeholder="Nouveau niveau"
            value={nom}
            maxLength={40}
            disabled={off}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void ajouter()}
            className="h-7 w-44"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={off || !nom.trim()}
            onClick={() => void ajouter()}
          >
            <Plus className="size-3.5" />
            Créer le niveau
          </Button>
        </div>
      )}
    </section>
  )
}
