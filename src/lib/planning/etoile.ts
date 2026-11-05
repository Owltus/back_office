/*
 * Journée étoile sur les horaires qui existent (décisions utilisateur du
 * 2026-11-02, D3 à D6 : « le bouton qui modifie les horaires doit
 * disparaître ; utiliser seulement les horaires déjà disponibles »). Un
 * contrat de plus de 35 h payé à l'heure (39 h = 4 × 8 h + 1 × 7 h,
 * R-JOURNEE-ETOILE, `regles.ts`) fait, un jour par semaine, un horaire de
 * MOINS de 8 h. Plus aucun raccourci : on prend un AUTRE horaire, sa version
 * étoile.
 *
 * SEULE source de ce qu'est une version étoile, pour le moteur (créneaux
 * étoile de `semaine.ts`), la base (migration 20261102100000, même calcul en
 * SQL pour compléter les listes d'horaires permis) et les écrans (rubrique
 * « Journée étoile », `rubriqueEtoile` d'`eligibilite.ts`).
 *
 * Version étoile V d'un horaire H :
 *   - H fait 8 h de travail exactement (présence moins pause) : une journée
 *     normale ; un horaire de 9 h ou 10 h n'a pas de version étoile ;
 *   - V fait de 7 h à moins de 8 h (`JOURNEE_ETOILE_MIN`, `JOURNEE_PLEINE`) ;
 *   - le moment peut changer (décision utilisateur du 2026-11-02 : « oui
 *     c'est possible en fonction des horaires disponibles dans le poste ») :
 *     09:00–16:45 (middle) est la version étoile de 08:00–16:45 (matin) ;
 *   - V est CONTENU dans H : il ne commence pas avant et ne finit pas après,
 *     en minutes depuis le début du jour de H. Un horaire qui commence à
 *     minuit commence à la fin du jour (« 24:00 », `horaireDe`) : la nuit de
 *     23:00 à 07:00 contient celle de 00:00 à 07:00.
 * Exemples de l'hôtel : 07:00–15:45 → 07:00–14:45, 07:30–15:15, 08:00–15:45 ;
 * 08:00–16:45 → 08:00–15:45, 09:00–16:45 ; 14:30–23:15 → 14:30–22:15,
 * 15:00–22:45 ; 23:00–07:00 → 00:00–07:00.
 */

import { TEMPS_PLEIN } from '#/lib/planning/regles.ts'
import {
  journeesDuContrat,
  modeleDe,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { bornesMurales, horaireDe } from '#/lib/planning/temps.ts'
import type { Horaire, Salarie } from '#/lib/planning/types.ts'

/** Ce qu'il faut d'un horaire pour le comparer : ses heures, sa pause et son
 * moment (absents : 0 et sans moment). */
export type HoraireEtoile = Pick<Horaire, 'id' | 'debut' | 'fin'> &
  Partial<Pick<Horaire, 'pause' | 'periode'>>

/** Début et fin de l'horaire posé un jour 0, en minutes murales (minuit en
 * début : 24:00). */
function plage(h: Pick<Horaire, 'debut' | 'fin'>): [number, number] {
  const { debut, fin } = horaireDe(h)
  return bornesMurales(0, debut, fin)
}

/** Temps de travail d'un horaire : présence moins pause. */
export function travailHoraire(h: Omit<HoraireEtoile, 'id'>): number {
  const [d, f] = plage(h)
  return f - d - (h.pause ?? 0)
}

/** `v` est-il une version étoile de `h` (règles en tête du fichier) ? */
export function estVersionEtoile(
  v: HoraireEtoile,
  h: HoraireEtoile,
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): boolean {
  const { journeePleine, journeeEtoileMin } = regles.contrats
  if (v.id === h.id) return false
  if (travailHoraire(h) !== journeePleine) return false
  const t = travailHoraire(v)
  if (t < journeeEtoileMin || t >= journeePleine) return false
  const [hd, hf] = plage(h)
  const [vd, vf] = plage(v)
  return vd >= hd && vf <= hf
}

/** Les versions étoile de `h` parmi `horaires`, triées par id. Vide pour un
 * horaire de moins de 8 h. */
export function versionsEtoile<T extends HoraireEtoile>(
  h: HoraireEtoile,
  horaires: readonly T[],
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): T[] {
  return horaires
    .filter((v) => estVersionEtoile(v, h, regles))
    .sort((a, b) => a.id - b.id)
}

/** Les horaires de 8 h dont `v` est la version étoile (« Journée normale »),
 * triés par id. Vide si `v` n'est la version étoile d'aucun. */
export function horairesNormaux<T extends HoraireEtoile>(
  v: HoraireEtoile,
  horaires: readonly T[],
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): T[] {
  return horaires
    .filter((h) => estVersionEtoile(v, h, regles))
    .sort((a, b) => a.id - b.id)
}

/** R-JOURNEE-ETOILE lu sur une fiche de l'écran : contrat de plus de 35 h,
 * ni forfait jours ni extra (même règle que `journeeEtoile` de `regles.ts`). */
export function contratEtoile(
  s: Pick<Salarie, 'heures_hebdo' | 'forfait_jours' | 'type_contrat'>,
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): boolean {
  return (
    Math.round(Number(s.heures_hebdo) * 60) > TEMPS_PLEIN &&
    !s.forfait_jours &&
    modeleDe(regles, s.type_contrat).journeeEtoile
  )
}

/** Un shift est une « journée étoile » (D5, calculé, rien n'est stocké) :
 * la personne a un contrat à journée étoile et le shift fait moins de 8 h de
 * travail (`travail` : minutes, pause déduite). */
export function estJourneeEtoile(
  s: Pick<Salarie, 'heures_hebdo' | 'forfait_jours' | 'type_contrat'>,
  travail: number,
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): boolean {
  return contratEtoile(s, regles) && travail < regles.contrats.journeePleine
}

/** Les horaires que peut prendre la journée étoile fixée un jour donné
 * (fiche salarié et « À vérifier », une seule source) : parmi `possibles`
 * (les horaires permis à la personne ce jour-là), les versions étoile de
 * l'horaire fixé s'il y en a un ; sinon ceux d'une durée de journée étoile
 * (de `journeeEtoileMin` à moins de `journeePleine`), et, si le contrat a
 * des journées imposées, d'une de ces durées (39 h : 7 h pile, celles que
 * le calcul sait poser, `journeesDuCalcul`). Vide : le planning
 * automatique ne pourra pas la placer ce jour-là. */
export function horairesEtoileDuJour<T extends HoraireEtoile>(
  possibles: readonly T[],
  fixe: HoraireEtoile | null | undefined,
  minutesHebdo: number,
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): T[] {
  if (fixe) return possibles.filter((h) => estVersionEtoile(h, fixe, regles))
  const { journeePleine, journeeEtoileMin } = regles.contrats
  const imposees = journeesDuContrat(regles, minutesHebdo)?.durees
  return possibles.filter((h) => {
    const t = travailHoraire(h)
    return (
      t >= journeeEtoileMin &&
      t < journeePleine &&
      (!imposees || imposees.includes(t))
    )
  })
}
