/*
 * Ce que change la case « Indispensable au fonctionnement » (page Postes),
 * en une phrase. Un poste indispensable entre dans le tableau du personnel
 * (décision utilisateur du 2026-11-11, plus de zones à régler : la base pose
 * `zone_id` d'après `indispensable`) ; un autre est rempli au mieux d'après
 * les fiches (`besoinsLus`). L'ordre de décision du planning est écrit dans
 * l'aide « ? » de la page Besoins (`AideBesoins.tsx`).
 */

export const AIDE_INDISPENSABLE =
  'Compte dans le tableau du personnel de la page Besoins, tenu sans interruption, jour et nuit. Le planning le remplit en premier.'
export const AIDE_NON_INDISPENSABLE =
  "Pas de tableau : le planning le remplit au mieux, d'après la fiche de chaque personne."
