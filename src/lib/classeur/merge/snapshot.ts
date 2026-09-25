/*
 * Instantanés de l'historique des fusions — porté de Registre
 * (`files.rs::strip_metadata`, `snapshots_equal`, `prune_merge_history`).
 *
 * Un instantané est un `ClasseurJson` produit par `construireExport` juste
 * avant une fusion. Deux instantanés sont « égaux » quand leurs DONNÉES le
 * sont : le bloc `_metadata` (qui porte `generated_at`, volatil) est écarté
 * de la comparaison ; les `updated_at` des éléments sont des données et
 * restent comparés, comme chez Registre. Sert à ne pas empiler deux fois le
 * même état dans l'historique et à ne pas restaurer un état déjà courant.
 */

/** Profondeur d'historique conservée par classeur (Registre en gardait 20). */
export const NOMBRE_MAX_HISTORIQUE = 10

/** Copie sans `_metadata` (miroir de `strip_metadata`). */
export function retirerMetadata(v: unknown): unknown {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return v
  const copie: Record<string, unknown> = { ...(v as Record<string, unknown>) }
  delete copie._metadata
  return copie
}

/**
 * Égalité structurelle de deux valeurs JSON : ordre des clés indifférent,
 * ordre des tableaux significatif (miroir de l'égalité de `serde_json::Value`).
 */
function jsonEgal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false
    return a.every((x, i) => jsonEgal(x, b[i]))
  }
  const oa = a as Record<string, unknown>
  const ob = b as Record<string, unknown>
  const clesA = Object.keys(oa).filter((k) => oa[k] !== undefined)
  const clesB = Object.keys(ob).filter((k) => ob[k] !== undefined)
  if (clesA.length !== clesB.length) return false
  return clesA.every((k) => k in ob && jsonEgal(oa[k], ob[k]))
}

/**
 * Miroir de `snapshots_equal` : même contenu hors `_metadata`. Accepte
 * `unknown` pour comparer directement un instantané relu de la base
 * (`fetchMergeSnapshot`) à un `ClasseurJson` fraîchement construit.
 */
export function instantaneEgal(a: unknown, b: unknown): boolean {
  return jsonEgal(retirerMetadata(a), retirerMetadata(b))
}

/**
 * Miroir de `prune_merge_history` : identifiants à supprimer pour ne garder
 * que les `max` entrées les plus récentes (`merged_at` décroissant, id
 * décroissant à égalité). Pur : `history.ts` exécute les suppressions.
 */
export function entreesAElaguer(
  entrees: ReadonlyArray<{ id: number; merged_at: string }>,
  max: number = NOMBRE_MAX_HISTORIQUE,
): number[] {
  return [...entrees]
    .sort((a, b) => b.merged_at.localeCompare(a.merged_at) || b.id - a.id)
    .slice(Math.max(0, max))
    .map((e) => e.id)
}
