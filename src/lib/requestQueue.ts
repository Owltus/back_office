/*
 * Plafond de requêtes simultanées vers Supabase.
 *
 * POURQUOI — mesure du 2026-09-22 sur la production, même requête (l'agrégat
 * PDJ sur 90 jours, 42 Ko de réponse, statut 200 vérifié), lancée en parallèle
 * à différents degrés :
 *
 *   parallèle | débit      | latence médiane
 *   ----------|------------|-----------------
 *       1     | 2,6 req/s  |   385 ms
 *       2     | 3,8 req/s  |   527 ms
 *       4     | 3,6 req/s  |   842 ms
 *       6     | 5,7 req/s  |   771 ms
 *       9     | 7,4 req/s  |   689 ms   <- sommet
 *      14     | 2,8 req/s  | 2 797 ms   <- effondrement
 *
 * Au-delà du sommet, la base ne ralentit pas proportionnellement : elle
 * S'EFFONDRE. Le débit est divisé par 2,6 et la latence par requête multipliée
 * par quatre. C'est la signature d'une instance qui passe son temps à arbitrer
 * entre des requêtes plutôt qu'à les servir.
 *
 * Or `/repjour` ouvrait VINGT lectures dans la même milliseconde — en plein
 * dans la zone d'effondrement. Et le dégât déborde de l'app : pendant cette
 * salve, un `curl` anonyme extérieur passait de 106 ms à 3,6 s puis 9,9 s.
 *
 * POURQUOI SIX, et pas neuf (le sommet mesuré) : le plafond est PAR ONGLET.
 * L'hôtel compte jusqu'à deux postes simultanés, donc six par onglet vaut
 * douze au pire — encore sous le seuil d'effondrement de quatorze. Neuf aurait
 * donné dix-huit, c'est-à-dire l'effondrement garanti dès que deux personnes
 * ouvrent une page en même temps. On échange 23 % de débit théorique contre la
 * garantie de ne jamais basculer.
 *
 * Ce module est PUR (aucun accès réseau, aucun import) : c'est ce qui le rend
 * testable, cf. `requestQueue.test.ts`.
 */

export interface Limiteur {
  /** Exécute `tache` dès qu'un jeton se libère. */
  run<T>(tache: () => Promise<T>): Promise<T>
  /** Nombre de tâches en cours d'exécution. */
  readonly enCours: number
  /** Nombre de tâches en attente d'un jeton. */
  readonly enAttente: number
}

/**
 * File d'attente PREMIER ARRIVÉ, PREMIER SERVI bornée à `max` tâches
 * simultanées.
 *
 * L'ordre strict compte : sans lui, une requête arrivée tard passerait devant
 * celles qui patientent dès qu'un jeton se libère, et une lecture malchanceuse
 * pourrait attendre indéfiniment pendant qu'une page en lance d'autres.
 */
export function createLimiteur(max: number): Limiteur {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`createLimiteur: max doit être un entier >= 1 (reçu ${max})`)
  }

  let actifs = 0
  const file: Array<() => void> = []

  /*
   * Libère EXACTEMENT un attendant. Appelé une fois par tâche terminée, après
   * la décrémentation : décrémentations et réveils restent donc à parité, ce
   * qui interdit à `actifs` de dépasser `max`.
   */
  const reveillerUn = () => {
    if (actifs >= max) return
    const reprendre = file.shift()
    if (reprendre) reprendre()
  }

  return {
    get enCours() {
      return actifs
    },
    get enAttente() {
      return file.length
    },
    async run<T>(tache: () => Promise<T>): Promise<T> {
      /*
       * `file.length > 0` autant que `actifs >= max` : même s'il reste un
       * jeton, on se met derrière ceux qui attendent déjà. C'est ce qui rend
       * la file équitable et non simplement bornée.
       */
      if (actifs >= max || file.length > 0) {
        await new Promise<void>((resoudre) => file.push(resoudre))
      }
      actifs++
      try {
        return await tache()
      } finally {
        actifs--
        reveillerUn()
      }
    },
  }
}
