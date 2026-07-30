/*
 * Constantes de date (mois, jours de semaine) en français — GÉNÉRIQUES, partagées
 * par toutes les features. Rangées ici (et non sous une feature) car repjour, pdj,
 * parking, rapro et caisse les consomment. `lib/repjour/constants.ts` les ré-exporte
 * pour compatibilité avec les imports existants.
 */

// Mois avec index vide pour accès direct par numéro (1-12).
export const MONTHS = [
  '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

// Mois en majuscules sans index vide (pour les selects 0-11).
export const MONTHS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/*
 * Abréviations mensuelles — UNIQUES (ne jamais faire `MONTHS_LABELS[i].slice(0, 3)` :
 * « Juin » et « Juillet » tronqués donnent tous deux « Jui », ce qui fabrique deux
 * libellés identiques. Sur un axe de graphique Recharts, deux catégories identiques
 * se superposent → on croit voir deux fois le même mois). Juin/Juil gardent 4 lettres
 * pour rester distincts.
 */
export const MONTHS_SHORT = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
];

export const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
