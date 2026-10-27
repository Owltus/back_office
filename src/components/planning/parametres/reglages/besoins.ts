/*
 * Lignes du tableau des besoins d'un poste (prototype `BesoinsPage.tsx`,
 * `lignesDuPoste`, `trouver`, `correspond`). Pur.
 */

import type { Besoin, Horaire } from '#/lib/planning/types.ts'

/** Une ligne : un code horaire, ou un horaire spécifique sans code. */
export interface LigneBesoin {
  cle: string
  horaire_id: number | null
  debut: string
  fin: string
}

/** Minimum obligatoire, places de soutien, places en plus facultatives. */
export interface Reglage {
  effectif: number
  soutien: number
  renfort: number
}

export function correspond(b: Besoin, ligne: LigneBesoin): boolean {
  return ligne.horaire_id !== null
    ? b.horaire_id === ligne.horaire_id
    : b.horaire_id === null && b.debut === ligne.debut && b.fin === ligne.fin
}

export function trouverBesoin(
  besoins: Besoin[],
  posteId: number,
  ligne: LigneBesoin,
  jour: number,
): Besoin | undefined {
  return besoins.find(
    (b) => b.poste_id === posteId && b.jour === jour && correspond(b, ligne),
  )
}

/**
 * Les codes permis pour le poste qui ont au moins un besoin (ou tous si
 * `tous`), PLUS les codes non permis qui portent encore un besoin (le
 * prototype les masquait : ils sont montrés, signalés), plus les horaires
 * spécifiques regroupés par début et fin. Tri par heure de début.
 */
export function lignesDuPoste(
  siens: Besoin[],
  horaires: Horaire[],
  possibles: Horaire[],
  tous: boolean,
): LigneBesoin[] {
  const permis = new Set(possibles.map((h) => h.id))
  const lignes: LigneBesoin[] = horaires
    .filter((h) =>
      permis.has(h.id)
        ? tous || siens.some((b) => b.horaire_id === h.id)
        : siens.some((b) => b.horaire_id === h.id),
    )
    .map((h) => ({
      cle: `t${h.id}`,
      horaire_id: h.id,
      debut: h.debut,
      fin: h.fin,
    }))
  const specifiques = new Map<string, LigneBesoin>()
  for (const b of siens) {
    if (b.horaire_id === null) {
      const cle = `h${b.debut}-${b.fin}`
      specifiques.set(cle, {
        cle,
        horaire_id: null,
        debut: b.debut,
        fin: b.fin,
      })
    }
  }
  return [...lignes, ...specifiques.values()].sort(
    (a, b) => a.debut.localeCompare(b.debut) || a.cle.localeCompare(b.cle),
  )
}
