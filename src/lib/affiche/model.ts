import type { PosterContent } from '#/lib/poster/types.ts'

/**
 * Un modèle d'affiche persisté (page Affichage).
 *
 * Un modèle mémorise désormais l'ÉTAT COMPLET de l'affiche (`PosterContent` :
 * textes FR/EN, icône, couleur, dates/heures, mode auto/manuel, tailles perso et
 * espacement) + un `name` d'affichage et un `id` (uuid Supabase). Entièrement
 * sérialisable : c'est la donnée écrite/lue dans la table `affiche_templates`.
 * Charger un modèle réapplique donc TOUT (y compris le mode taille et les tailles
 * personnalisées) → « tout est sauvegardé et facile à ressortir ».
 */
export interface AfficheTemplate extends PosterContent {
  id: string
  name: string
  /** Auteur d'origine (id du compte). `null` = modèle historique/seed, sans
   * auteur (modifiable en gestion uniquement). Posé et figé côté serveur. */
  createdBy: string | null
}

/** Champs éditables d'un modèle (contenu de l'affiche + nom). Sans `id` ni
 * `createdBy` : l'auteur est géré par le serveur, jamais saisi. */
export type AfficheTemplateInput = Omit<AfficheTemplate, 'id' | 'createdBy'>
