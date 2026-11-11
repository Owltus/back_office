/** Ajoute `v` à la liste de `k` (créée au besoin), dans l'ordre d'arrivée.
    Remplace `m.set(k, [...(m.get(k) ?? []), v])`, qui recopiait la liste
    à chaque ajout. */
export function ajouter<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const liste = m.get(k)
  if (liste) liste.push(v)
  else m.set(k, [v])
}
