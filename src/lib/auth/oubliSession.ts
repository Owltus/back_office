/*
 * OUBLIER LA SESSION (2026-11-18, audit de sécurité run-2, étape 4).
 *
 * Le poste de la réception est PARTAGÉ. Le cache TanStack Query est vidé à
 * chaque changement de compte (`changerDeCompte`, `lib/queryPersist.ts`), mais
 * plusieurs modules gardent AUSSI des données en mémoire de module, hors de ce
 * cache : les factures chargées (`facturationStore`), l'affiche en cours
 * (`afficheStore`), les URL `blob:` des images du Classeur, les résolutions
 * mémorisées des points de restauration. Elles survivaient à la déconnexion,
 * et le compte suivant pouvait les voir.
 *
 * Chaque module s'inscrit ici AU CHARGEMENT (`surOubliSession`) ;
 * `changerDeCompte` appelle `oublierSession()` une seule fois, à côté du
 * vidage du cache. Une réinitialisation qui jette n'empêche jamais les
 * suivantes (chacune sous son propre `try`).
 */

type Reinitialisation = () => void

const reinitialisations = new Set<Reinitialisation>()

/** Inscrit une réinitialisation ; rend la fonction qui la désinscrit. */
export function surOubliSession(fn: Reinitialisation): () => void {
  reinitialisations.add(fn)
  return () => {
    reinitialisations.delete(fn)
  }
}

/** Joue toutes les réinitialisations inscrites, chacune isolément. */
export function oublierSession(): void {
  for (const fn of [...reinitialisations]) {
    try {
      fn()
    } catch (err) {
      console.warn('[auth] réinitialisation de session en échec', err)
    }
  }
}
