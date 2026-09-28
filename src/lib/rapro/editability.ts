import { RAPRO_GRACE_DAYS } from '#/lib/permissions/actions.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { PageLevel } from '#/lib/permissions/levels.ts'
import { addDays } from '#/lib/rapro/day.ts'

/* --------------------------------------------------------------------------
 * Éditabilité d'un jour de rapprochement (pur : sans React).
 *
 * Le rapprochement se fait JOUR par JOUR. Règle d'accès :
 *   - lecture  : consultation seule (aucune action).
 *   - ecriture : agit uniquement dans la FENÊTRE de grâce — le jour affiché doit
 *     être dans les RAPRO_GRACE_DAYS derniers jours (aujourd'hui, J-1, J-2). Dans
 *     cette fenêtre : éditer la grille, clôturer, rouvrir puis re-clôturer. Au-delà
 *     dans le passé : AUCUNE modification, même si le jour n'est pas clôturé.
 *   - gestion  : peut tout faire, n'importe quel jour.
 *
 * Les dates sont des chaînes 'YYYY-MM-DD' (comparaison lexicale = chronologique).
 * Miroir de la borne RLS `report_date >= current_date - RAPRO_GRACE_DAYS`.
 * ------------------------------------------------------------------------ */

/** Le jour est-il dans la fenêtre d'action de l'écriture (J-0..J-grâce) ? */
export function isDayWithinGrace(day: string, today: string): boolean {
  return day >= addDays(today, -RAPRO_GRACE_DAYS)
}

/**
 * L'utilisateur peut-il agir sur CE jour (éditer la grille, clôturer, rouvrir) ?
 * gestion : toujours ; ecriture : seulement dans la fenêtre de grâce ; en dessous
 * d'écriture (lecture / aucun accès) : jamais.
 */
export function canReconcileDay(
  day: string,
  today: string,
  level: PageLevel | null | undefined,
): boolean {
  if (atLeastLevel(level, 'gestion')) return true
  if (!atLeastLevel(level, 'ecriture')) return false
  return isDayWithinGrace(day, today)
}

/* --------------------------------------------------------------------------
 * Actions qui exigent des LECTURES réussies (contre-revue du 2026-09-28).
 *
 * Une lecture en erreur rend des valeurs PAR DÉFAUT (statuts vides, aucune
 * chambre vendue, aucune ligne matérialisée) que rien ne distingue, à l'écran,
 * de vraies données. Agir dessus écrit du faux :
 *   - clôturer sur un jour NON LU matérialise « nettoyée » par-dessus les refus
 *     et les bloquées réels (l'upsert écrase la couleur), et la réouverture
 *     suivante SUPPRIME ces lignes, désormais marquées matérialisées ;
 *   - réouvrir sur un jour NON LU ne purge rien (aucune ligne matérialisée
 *     connue) : les nettoyées fantômes restent facturées ;
 *   - cliquer une case sans occupation lue fait tourner le cycle d'une
 *     chambre « non vendue » qui l'est peut-être.
 *
 * Deux exigences différentes, et elles ne se confondent pas :
 *   - `jourLu` = la lecture du jour a RÉUSSI (`isSuccess` strict). Clôture et
 *     réouverture réécrivent des lignes en masse à partir de cet instantané :
 *     une donnée dont le dernier rafraîchissement a échoué peut être périmée
 *     (un collègue a posé un refus depuis), on n'écrit pas en masse dessus.
 *   - `occupationDisponible` = l'occupation a été lue AU MOINS UNE FOIS
 *     (`data !== undefined`). Pour une case, qui n'écrit qu'UNE chambre et se
 *     corrige d'un clic, une occupation dont un réessai d'arrière-plan a échoué
 *     reste la meilleure connaissance disponible — on ne verrouille pas la
 *     grille pour un rafraîchissement raté.
 * ------------------------------------------------------------------------ */

/** Clôturer : jour lu ET occupation lue (sinon rien ou n'importe quoi à matérialiser). */
export function clotureAutorisee(etat: {
  jourLu: boolean
  occupationLue: boolean
}): boolean {
  return etat.jourLu && etat.occupationLue
}

/** Réouvrir : jour lu (sinon la purge des lignes matérialisées ne voit rien). */
export function reouvertureAutorisee(etat: { jourLu: boolean }): boolean {
  return etat.jourLu
}

/** Cases de la grille éditables : champs éditables, jour lu, occupation disponible. */
export function grilleEditable(etat: {
  champsEditables: boolean
  jourLu: boolean
  occupationDisponible: boolean
}): boolean {
  return etat.champsEditables && etat.jourLu && etat.occupationDisponible
}
