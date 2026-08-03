/*
 * Fenêtres de grâce des niveaux d'accès — SOURCE UNIQUE.
 *
 * Sémantique commune des trois niveaux (cf. plan/acces-par-page-consolidation) :
 *   - lecture  : consulter (données + analytique), aucun effet de bord.
 *   - ecriture : créer/modifier/supprimer la donnée D'ACTUALITÉ — présent, futur,
 *                passé récent (dans la fenêtre de grâce) et tout ce qui est encore
 *                en cours.
 *   - gestion  : tout ce que `ecriture` permet, PLUS la modification du passé
 *                verrouillé (au-delà de la fenêtre de grâce). Seul niveau qui
 *                « rouvre » l'historique figé.
 *
 * Les valeurs ci-dessous sont reprises À L'IDENTIQUE par les policies RLS
 * Supabase (garder les deux synchronisés).
 */

/**
 * Parking : nombre de jours, après la date de fin de séjour d'une réservation,
 * pendant lesquels elle reste modifiable en `ecriture`. Au-delà, seule la
 * `gestion` peut la modifier. Miroir de la borne `(start_date + nights) >=
 * current_date - 7` côté RLS.
 */
export const PARKING_GRACE_DAYS = 7
