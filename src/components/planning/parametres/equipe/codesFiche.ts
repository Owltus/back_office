/*
 * Les codes horaires vus depuis la fiche d'une personne (plan
 * `planning-coherence-2026-10-28`, étape 4, D5 = A) : la fiche HÉRITE des
 * codes de ses postes et ne peut que les restreindre. Tout passe par la
 * règle unique (`eligibilite.ts`) : rien n'est recopié ici, on compose.
 *
 * En base, la fiche n'a qu'UNE liste (`shifts_autorises`) pour tous ses
 * postes : elle se choisit donc parmi l'UNION des codes de ses postes, et
 * chaque poste montre ce qu'il en reste pour elle (l'intersection).
 */

import {
  codeDeLaFiche,
  codesDeLaFiche,
  codesDuPoste,
  codesPermis,
} from '#/lib/planning/eligibilite.ts'
import type { Horaire, Poste, Salarie } from '#/lib/planning/types.ts'

type Fiche = Pick<Salarie, 'competences' | 'shifts_autorises'>

/** Les postes qu'elle tient, dans l'ordre des postes. */
function postesTenus(b: Pick<Salarie, 'competences'>, postes: Poste[]) {
  const ids = new Set(b.competences.map((c) => c.poste_id))
  return postes.filter((p) => ids.has(p.id))
}

/** Les codes de ses postes (union), dans l'ordre des codes. Sans poste :
 * tous (la fiche le signale déjà). */
export function codesDeSesPostes(
  b: Pick<Salarie, 'competences'>,
  postes: Poste[],
  horaires: Horaire[],
): Horaire[] {
  const tenus = postesTenus(b, postes)
  if (!tenus.length) return [...horaires]
  const ids = new Set(
    tenus.flatMap((p) => codesDuPoste(p, horaires).map((h) => h.id)),
  )
  return horaires.filter((h) => ids.has(h.id))
}

export interface CodesSurUnPoste {
  poste: Poste
  /** Les codes du poste. */
  codes: Horaire[]
  /** Ceux qu'elle peut y tenir (codes du poste permis par sa fiche). */
  utilisables: Horaire[]
}

/** Pour chaque poste tenu : ses codes, et ceux qu'elle peut y tenir. */
export function codesParPoste(
  b: Fiche,
  postes: Poste[],
  horaires: Horaire[],
): CodesSurUnPoste[] {
  const fiche = { shiftsAutorises: codesDeLaFiche(b) }
  return postesTenus(b, postes).map((poste) => {
    const codes = codesDuPoste(poste, horaires)
    return {
      poste,
      codes,
      utilisables: codes.filter((h) => codeDeLaFiche(fiche, String(h.id))),
    }
  })
}

/** Codes cochés dans sa fiche qu'aucun de ses postes ne prévoit plus. */
export function codesMorts(
  b: Fiche,
  postes: Poste[],
  horaires: Horaire[],
): Horaire[] {
  const vivants = new Set(
    codesDeSesPostes(b, postes, horaires).map((h) => h.id),
  )
  return horaires.filter(
    (h) => b.shifts_autorises.includes(h.id) && !vivants.has(h.id),
  )
}

/**
 * Les codes que la semaine type peut fixer ce jour-là : ceux que la règle
 * unique permet sur au moins un de ses postes. Le code déjà fixé ce jour-là
 * est mis de côté le temps du calcul (sinon il serait seul permis).
 */
export function codesSemaineType(
  b: Fiche & Pick<Salarie, 'semaine_type' | 'mineur'>,
  postes: Poste[],
  horaires: Horaire[],
  jour: number,
): Horaire[] {
  const personne = {
    ...b,
    semaine_type: b.semaine_type.map((e, j) =>
      j === jour ? { ...e, type_shift_id: null } : e,
    ),
  }
  const tenus = postesTenus(b, postes)
  const ids = new Set(
    (tenus.length ? tenus : [undefined]).flatMap((poste) =>
      codesPermis({ personne, poste, jour, horaires }).codes.map((h) => h.id),
    ),
  )
  return horaires.filter((h) => ids.has(h.id))
}
