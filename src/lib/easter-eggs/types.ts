/*
 * Contrat de la table `easter_eggs` — déclencheurs clavier configurables
 * (mot-clé → effet visuel). Deux formes, le service faisant la conversion :
 * `DbEasterEgg` (colonnes SQL, snake_case) et `EasterEgg` (objet applicatif,
 * camelCase). Voir `supabase/easter_eggs.sql`.
 *
 * `effectId` référence un `id` du registre `lib/artefact/effects` (résolu au
 * runtime ; un id inconnu est simplement ignoré).
 */

export interface DbEasterEgg {
  id: string
  keyword: string
  effect_id: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface EasterEgg {
  id: string
  keyword: string
  effectId: string
  enabled: boolean
}

/** Champs modifiables depuis la page admin (création / édition). */
export interface EasterEggInput {
  keyword: string
  effectId: string
  enabled: boolean
}
