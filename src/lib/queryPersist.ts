import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import type { Query, QueryClient } from '@tanstack/react-query'

/*
 * PERSISTANCE DU CACHE DE DONNÉES SUR DISQUE.
 *
 * POURQUOI — panne du 2026-09-24 (`plan/panne-supabase-2026-09-24/`). La base
 * a cessé de servir les requêtes pendant quarante minutes. Le cache TanStack
 * Query vivait alors EN MÉMOIRE et cinq minutes : un rafraîchissement de page,
 * une ouverture d'onglet, et il ne restait plus rien à afficher. L'hôtel s'est
 * retrouvé devant un écran vide.
 *
 * Ce module ne répare pas la panne — nous n'en connaissons pas la cause, et
 * elle est vraisemblablement côté plateforme. Il en supprime la CONSÉQUENCE :
 * pendant une coupure, l'application continue de LIRE les dernières données
 * connues (rapport de la veille, service du matin, planning) au lieu de ne
 * rien montrer. Une panne devient une gêne, plus un arrêt.
 *
 * ⚠ CE QUI N'EST PAS ÉCRIT SUR LE DISQUE — voir `PREFIXES_SENSIBLES`. Le
 * poste de la réception est PARTAGÉ : y déposer des noms de clients serait
 * créer un problème pour en résoudre un autre. Cette liste est la seule
 * chose à tenir à jour quand une nouvelle lecture apparaît.
 *
 * ⚠ ÉCRITURES : rien ici ne les concerne. Une saisie faite pendant une panne
 * n'est PAS mise en file et ne partira PAS toute seule — le cache persisté est
 * un cache de LECTURE. C'est délibéré : rejouer des écritures en différé sur
 * une caisse ou un rapprochement demanderait une résolution de conflits que
 * personne n'a demandée.
 */

/**
 * Version du format du cache. À INCRÉMENTER dès qu'une `queryFn` change la
 * FORME de ce qu'elle rend (colonne ajoutée, RPC remplacée, agrégat
 * restructuré).
 *
 * Sans ça, un cache écrit par la version précédente serait restauré dans du
 * code qui ne sait plus le lire — et l'écran planterait au lieu d'être
 * simplement vide, ce qui est pire que le mal soigné. Un changement de version
 * jette tout le cache : l'application repart en réseau, c'est-à-dire
 * exactement le comportement d'avant ce module.
 */
const VERSION_CACHE = 'v1'

const CLE_STOCKAGE = `bo.query.cache.${VERSION_CACHE}`

/**
 * Durée au-delà de laquelle un cache restauré est jeté.
 *
 * Vingt-quatre heures : assez pour couvrir une panne de nuit, un week-end
 * entamé le vendredi soir, ou un poste rallumé le lendemain matin. Au-delà,
 * des chiffres d'hôtellerie périmés induiraient en erreur — mieux vaut un
 * écran qui attend qu'un écran qui ment.
 */
const AGE_MAX_MS = 24 * 60 * 60 * 1000

/**
 * Préfixes de `queryKey` dont le contenu NE DOIT PAS toucher le disque.
 *
 * Le critère est la donnée personnelle, pas la sensibilité commerciale :
 *
 *   `pdj` / `day`            noms des clients du petit-déjeuner. Il existe
 *                            même une purge RGPD serveur pour ces noms
 *                            (`lib/pdj/purgeGate.ts`) : les recopier sur le
 *                            disque d'un poste partagé annulerait cette purge.
 *   `parking` / `reservations`  noms des clients du parking. ⚠ Cette clé est
 *                            construite par une fonction
 *                            (`reservationsKey`, ParkingBoard) et n'apparaît
 *                            donc pas dans une recherche naïve de `queryKey:`
 *                            — c'est ainsi qu'elle a failli être oubliée.
 *   `comptes`                adresses e-mail et identités du personnel.
 *   `facturation`            documents fournisseurs, mémoire d'imputation.
 *                            Admin seul, volumineux, et sans intérêt en
 *                            situation de panne.
 *   `caisse` / `cautions`    lues en `select('*')`, commentaire libre inclus
 *                            (une caution mentionne parfois un nom).
 *
 * Tout le reste — agrégats, analytiques, référentiels, états de chambres,
 * rapport journalier — ne porte aucune donnée nominative et constitue
 * justement ce qu'on veut pouvoir lire hors ligne.
 */
const PREFIXES_SENSIBLES: ReadonlyArray<ReadonlyArray<string>> = [
  ['pdj', 'day'],
  ['parking', 'reservations'],
  ['comptes'],
  ['facturation'],
  ['caisse', 'cautions'],
]

/** Vrai si la clé commence par l'un des préfixes sensibles. */
export function estSensible(cle: ReadonlyArray<unknown>): boolean {
  return PREFIXES_SENSIBLES.some((prefixe) =>
    prefixe.every((segment, i) => cle[i] === segment),
  )
}

/**
 * Vrai si cette requête mérite d'être écrite sur le disque.
 *
 * Deux refus, pour deux raisons différentes :
 *   - la clé est sensible (voir ci-dessus) ;
 *   - la requête n'a pas de données réussies à offrir. Persister une erreur
 *     n'aurait aucun sens : au prochain démarrage on restaurerait une panne.
 */
export function doitPersister(query: Query): boolean {
  if (query.state.status !== 'success') return false
  return !estSensible(query.queryKey as ReadonlyArray<unknown>)
}

/**
 * Branche la persistance. Sans effet hors navigateur (le shell est prérendu).
 *
 * ⚠ La restauration n'est PAS bloquante, et c'est voulu. La faire attendre
 * retarderait le démarrage de tout le monde, tous les jours, pour un bénéfice
 * qui ne sert qu'en panne. La course qu'on accepte est bénigne : au démarrage
 * normal, les requêtes partent, réussissent, et écrasent le cache restauré —
 * personne ne voit rien. En panne, elles échouent au bout de plusieurs
 * secondes alors que la restauration, elle, a pris quelques millisecondes :
 * les données restaurées sont donc déjà là, et React Query les CONSERVE à
 * l'écran en marquant la requête en erreur. C'est exactement le comportement
 * recherché.
 *
 * ⚠ `localStorage` peut jeter (navigation privée, quota atteint, poste
 * verrouillé par une politique). Une panne de cache ne doit jamais empêcher
 * l'application de démarrer : tout est sous `try`.
 */
export function brancherPersistance(queryClient: QueryClient): void {
  if (typeof window === 'undefined') return

  try {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: CLE_STOCKAGE,
      // Un débit d'écriture, pour ne pas sérialiser tout le cache à chaque
      // mutation d'une seule requête.
      throttleTime: 2_000,
      // Le cache ne rentre plus dans le quota : on abandonne la persistance
      // plutôt que de faire échouer l'application.
      retry: () => undefined,
    })

    persistQueryClient({
      queryClient,
      persister,
      maxAge: AGE_MAX_MS,
      buster: VERSION_CACHE,
      dehydrateOptions: { shouldDehydrateQuery: doitPersister },
    })
  } catch {
    // Sans conséquence : on repart sur un cache purement en mémoire, soit le
    // comportement d'avant le 2026-09-24.
  }
}
