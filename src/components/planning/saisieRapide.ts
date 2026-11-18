/*
 * Saisie rapide du planning (demande utilisateur du 2026-11-18), logique pure
 * partagée par la vue semaine et la vue mois :
 *
 * 1. Valider ou invalider en masse les shifts d'une personne (clic droit sur
 *    son nom) : `shiftsAChanger` compte EXACTEMENT ce que
 *    `planning_valider_periode` changera (même règle, écrite deux fois : la
 *    base fait foi, l'écran l'annonce).
 * 2. Copier un shift avec Ctrl (Cmd sur Mac) maintenu : `copieDe` retient ce
 *    qui se recopie (poste, horaire ou heures spécifiques, pause), jamais la
 *    personne, le jour ni la validation ; un collage arrive en proposition.
 */

import { ajouterJours, heureAffichee } from '#/lib/planning/temps.ts'
import type { ShiftOut } from '#/lib/planning/semaine.ts'

// ------------------------------------------- validation d'une période

export interface PeriodeValidation {
  /** Les contrats de la personne (une ligne de la vue mois peut en montrer
   * plusieurs qui se suivent). */
  salaries: readonly number[]
  du: string
  au: string
}

/** Nombre de shifts que `planning_valider_periode` changera : ceux de la
 * personne dans la période, qui ne sont pas déjà dans l'état voulu, hors
 * semaine verrouillée ; un jour passé ne redevient une proposition que pour
 * la gestion. */
export function shiftsAChanger(
  semaines: Iterable<{
    lundi: string
    verrouillee?: boolean
    affectations: ReadonlyArray<
      Pick<ShiftOut, 'salarie_id' | 'jour' | 'epinglee'>
    >
  }>,
  periode: PeriodeValidation,
  epinglee: boolean,
  aujourdhui: string,
  gerer: boolean,
): number {
  const siens = new Set(periode.salaries)
  let n = 0
  for (const s of semaines) {
    if (s.verrouillee) continue
    for (const a of s.affectations) {
      if (!siens.has(a.salarie_id) || a.epinglee === epinglee) continue
      const date = ajouterJours(s.lundi, a.jour)
      if (date < periode.du || date > periode.au) continue
      if (!epinglee && !gerer && date < aujourdhui) continue
      n++
    }
  }
  return n
}

/** « Valider 22 shifts », « Invalider 1 shift », ou le libellé générique quand
 * il n'y a rien à changer. */
export function libelleValidationPeriode(n: number, epinglee: boolean): string {
  const verbe = epinglee ? 'Valider' : 'Invalider'
  return n > 0
    ? `${verbe} ${n} shift${n > 1 ? 's' : ''}`
    : `${verbe} tous les shifts`
}

/** Ce que dit la ligne quand il n'y a rien à changer. */
export function texteRienAChanger(epinglee: boolean): string {
  return epinglee ? 'Tout est déjà validé' : 'Aucun shift validé à remettre'
}

// ------------------------------------------------------- copie au Ctrl

/** Ce qu'un collage recopie d'un shift. */
export interface ShiftCopie {
  poste_id: number
  horaire_id: number | null
  debut: string
  fin: string
  pause: number
}

export function copieDe(
  s: Pick<ShiftOut, 'poste_id' | 'type_shift_id' | 'debut' | 'fin' | 'pause'>,
): ShiftCopie {
  return {
    poste_id: s.poste_id,
    horaire_id: s.type_shift_id,
    debut: s.debut,
    fin: s.fin,
    pause: s.pause,
  }
}

/** Le shift de la case est déjà celui de la copie : coller ne changerait que
 * sa validation, rien n'est fait. */
export function memeShift(
  s: Pick<ShiftOut, 'poste_id' | 'type_shift_id' | 'debut' | 'fin' | 'pause'>,
  c: ShiftCopie,
): boolean {
  return (
    s.poste_id === c.poste_id &&
    s.type_shift_id === c.horaire_id &&
    s.debut === c.debut &&
    s.fin === c.fin &&
    s.pause === c.pause
  )
}

/** « 07:00–15:45 » (l'heure de minuit s'écrit comme à l'écran). */
export function libelleCopie(c: Pick<ShiftCopie, 'debut' | 'fin'>): string {
  return `${heureAffichee(c.debut)}–${heureAffichee(c.fin)}`
}

/** La touche du mode copie : Cmd sur Mac (Ctrl + clic y ouvre le menu
 * contextuel), Ctrl ailleurs. */
export function toucheCopie(plateforme: string): 'Meta' | 'Control' {
  return /mac|iphone|ipad/i.test(plateforme) ? 'Meta' : 'Control'
}

/** Le clic est fait touche du mode copie enfoncée. */
export function clicDeCopie(
  e: { ctrlKey: boolean; metaKey: boolean },
  touche: 'Meta' | 'Control',
): boolean {
  return touche === 'Meta' ? e.metaKey : e.ctrlKey
}

/** Nom de la touche, pour l'écran. */
export const nomTouche = (touche: 'Meta' | 'Control') =>
  touche === 'Meta' ? 'Cmd' : 'Ctrl'

/** Règle CSS qui met en évidence la case source (sélecteur d'attribut sur des
 * nombres ou une date seulement). */
export function styleSource(attribut: string, valeur: string): string {
  if (!/^[a-z-]+$/.test(attribut) || !/^[0-9:|-]+$/.test(valeur)) return ''
  return `.planning-copie [${attribut}="${valeur}"]{box-shadow:inset 0 0 0 2px var(--color-primary);background:color-mix(in oklab,var(--color-primary) 14%,transparent)}`
}
