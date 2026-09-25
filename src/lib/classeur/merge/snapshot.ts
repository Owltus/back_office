/*
 * Instantanés de l'historique des fusions — porté de Registre
 * (`files.rs::strip_metadata`, `snapshots_equal`, `prune_merge_history`).
 *
 * Un instantané est un `ClasseurJson` produit par `construireExport` juste
 * avant une fusion. Deux instantanés sont « égaux » quand leurs DONNÉES le
 * sont : le bloc `_metadata` (qui porte `generated_at`, volatil) est écarté
 * de la comparaison, ainsi que les `updated_at` (2026-09-25 : Registre les
 * comparait, mais ici la base les réestampille à chaque écriture, donc deux
 * états au contenu identique n'étaient JAMAIS égaux et chaque restauration
 * empilait un instantané de sécurité inutile). Sert à ne pas empiler deux
 * fois le même état dans l'historique et à ne pas restaurer un état déjà
 * courant.
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
  const garder = (o: Record<string, unknown>) => (k: string) =>
    o[k] !== undefined && k !== 'updated_at'
  const clesA = Object.keys(oa).filter(garder(oa))
  const clesB = Object.keys(ob).filter(garder(ob))
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

/**
 * Élagage par GENRE (points de restauration, 2026-09-26) : les points `auto`
 * (mineurs) ont leur quota, les autres (`manuel`, `fusion`, `securite` :
 * majeurs) partagent le leur. À quota majeur atteint, les points `securite`
 * partent en premier (ce sont des filets, pas des jalons choisis), puis les
 * plus anciens. Rend les identifiants à supprimer.
 */
export function entreesAElaguerParGenre(
  entrees: ReadonlyArray<{ id: number; merged_at: string; kind: string }>,
  quotas: { auto: number; majeur: number } = { auto: 10, majeur: 10 },
): number[] {
  const recentDAbord = (
    a: { id: number; merged_at: string },
    b: { id: number; merged_at: string },
  ) => b.merged_at.localeCompare(a.merged_at) || b.id - a.id

  const auto = entrees.filter((e) => e.kind === 'auto').sort(recentDAbord)
  const majeurs = entrees.filter((e) => e.kind !== 'auto')
  // Les jalons choisis d'abord (les plus récents en tête), les filets ensuite.
  const jalons = majeurs.filter((e) => e.kind !== 'securite').sort(recentDAbord)
  const filets = majeurs.filter((e) => e.kind === 'securite').sort(recentDAbord)

  return [
    ...auto.slice(Math.max(0, quotas.auto)),
    ...[...jalons, ...filets].slice(Math.max(0, quotas.majeur)),
  ].map((e) => e.id)
}
