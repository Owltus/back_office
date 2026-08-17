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

/**
 * Rapprochement : nombre de jours dans le passé où un compte `ecriture` peut
 * encore agir (éditer la grille, clôturer, rouvrir puis re-clôturer). Fenêtre
 * J-0..J-RAPRO_GRACE_DAYS. Au-delà, aucune modification en `ecriture` même si le
 * jour n'est pas clôturé ; seule la `gestion` reste libre. Miroir de la borne
 * `report_date >= current_date - 2` côté RLS.
 */
export const RAPRO_GRACE_DAYS = 2

/**
 * Caisse : même principe que le rapprochement, mais fenêtre plus COURTE. Nombre de
 * jours dans le passé où un compte `ecriture` peut encore agir (saisir, clôturer,
 * rouvrir puis re-clôturer) sur une feuille, d'après sa date (report_date). Fenêtre
 * J-0..J-CAISSE_GRACE_DAYS = aujourd'hui et J-1 SEULEMENT. Au-delà (dès J-2) :
 * aucune modification en `ecriture`, même feuille non clôturée ; seule la `gestion`
 * reste libre. Remplace l'ancien verrou « 24 h après validation ». Miroir de la
 * borne `report_date >= current_date - 1` côté RLS.
 */
export const CAISSE_GRACE_DAYS = 1

/**
 * PDJ : même principe que rapro/caisse. Nombre de jours dans le passé où un compte
 * `ecriture` peut encore cocher/servir les petits-déjeuners d'un jour, d'après sa
 * date de service. Fenêtre J-0..J-PDJ_GRACE_DAYS = aujourd'hui et les 3 jours
 * précédents. Au-delà : aucune saisie en `ecriture` ; seule la `gestion` reste
 * libre. Miroir de la borne `service_date >= current_date - 3` côté RLS.
 */
export const PDJ_GRACE_DAYS = 3

/**
 * Literie : nombre de jours dans le passé où un compte `ecriture` peut encore
 * créer/modifier une assignation de lit bébé (d'après ses bornes
 * `start_date`/`end_date`). Fenêtre J-0..J-LITERIE_GRACE_DAYS. Au-delà, seule
 * la `gestion` reste libre. Le statut « literie synthétique installée » d'une
 * chambre (`hotel_rooms`), lui, reste modifiable en `ecriture` à tout moment —
 * état permanent sans notion de jour, pas de fenêtre de grâce sur ce point
 * précis. Table `literie_sheets` : plus consommée par l'app (clôture/
 * commentaire retirés à la demande de l'utilisateur) — table restée en base,
 * orpheline. Miroir des bornes `start_date`/`end_date >= current_date - 2`
 * côté RLS (`supabase/literie_rls.sql`).
 */
export const LITERIE_GRACE_DAYS = 2
