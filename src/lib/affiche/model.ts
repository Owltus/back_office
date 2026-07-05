import type { ColorKey } from '#/lib/poster/config.ts'

/**
 * Un modèle d'affiche persisté (page Affichage).
 *
 * 7 champs métier + un `id` (uuid Supabase). Entièrement sérialisable (aucune
 * `Date`, aucune fonction) : c'est la donnée écrite/lue dans la table
 * `affiche_templates`. Il remplace l'ancienne collection en dur (les 7 modèles
 * historiques sont désormais seedés dans la table via le script SQL).
 */
export interface AfficheTemplate {
  id: string
  name: string
  icon: string
  color: ColorKey
  titleFr: string
  messageFr: string
  titleEn: string
  messageEn: string
}

/** Champs éditables d'un modèle (formulaire de création / édition, sans `id`). */
export type AfficheTemplateInput = Omit<AfficheTemplate, 'id'>
