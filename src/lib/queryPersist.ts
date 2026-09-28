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
 *
 * Historique :
 *   v1  2026-09-24  première version.
 *   v2  2026-09-25  les caches v1 contiennent des `Set`/`Map` aplatis en `{}`
 *                   (voir `survitAuJson`) : `/repjour` plantait à la
 *                   restauration (« carriedManual is not iterable »). Le
 *                   changement de version les jette, et `CLES_PERIMEES` les
 *                   efface du disque.
 */
const VERSION_CACHE = 'v2'

const CLE_STOCKAGE = `bo.query.cache.${VERSION_CACHE}`

/** Clés des versions précédentes, à effacer au branchement : un cache que plus
 * personne ne lit n'a rien à faire sur un poste partagé. */
const CLES_PERIMEES = ['bo.query.cache.v1']

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
  // Historique des documents du Classeur : noms des collègues (2026-09-27).
  ['classeur', 'versions'],
  // Accès par classeur : identifiants, droits et noms des personnes (2026-09-28).
  ['classeur', 'acces'],
  // Lits bébé : `label` est un texte libre « Nom / chambre » (2026-09-28).
  ['baby-cots', 'assignments'],
]

/** Vrai si la clé commence par l'un des préfixes sensibles. */
export function estSensible(cle: ReadonlyArray<unknown>): boolean {
  return PREFIXES_SENSIBLES.some((prefixe) =>
    prefixe.every((segment, i) => cle[i] === segment),
  )
}

/**
 * Vrai si cette valeur ressort de `JSON.parse(JSON.stringify(v))` IDENTIQUE.
 *
 * Le persister écrit du JSON, et JSON ne connaît que les primitives, les
 * tableaux et les objets nus. Un `Set` ou une `Map` y deviennent `{}`, une
 * `Date` une chaîne, une instance de classe un objet sans méthodes. Le cache
 * était alors restauré dans du code qui itère un `Set` ou appelle `.get()`
 * sur une `Map` — et l'écran plantait, ce qui est PIRE que l'écran vide que
 * ce module devait éviter (bug du 2026-09-25 : `RaproDay.carriedManual`,
 * `RaproDay.statuses`, lus par `/repjour` et `/rapro`).
 *
 * Plutôt que d'énumérer les clés concernées (la prochaine `queryFn` qui
 * rendra un `Set` serait oubliée), on regarde la DONNÉE : ce qui ne survit
 * pas au JSON n'est pas écrit, point. La requête garde son cache mémoire et
 * repart en réseau au démarrage suivant, comme avant le 2026-09-24. Un
 * agrégat de 17 ko se parcourt en une fraction de milliseconde, et l'écriture
 * est débitée à 2 s : le coût est nul.
 */
export function survitAuJson(valeur: unknown): boolean {
  if (valeur === null) return true
  switch (typeof valeur) {
    case 'string':
    case 'boolean':
      return true
    case 'number':
      // NaN et ±Infinity deviennent `null` : le chiffre restauré mentirait.
      return Number.isFinite(valeur)
    case 'undefined':
      // Une propriété absente ne se voit pas ; c'est le seul cas toléré.
      return true
    case 'object':
      break
    default:
      // function, bigint, symbol
      return false
  }
  if (Array.isArray(valeur)) return valeur.every(survitAuJson)
  const proto = Object.getPrototypeOf(valeur) as unknown
  if (proto !== Object.prototype && proto !== null) return false
  return Object.values(valeur as Record<string, unknown>).every(survitAuJson)
}

/**
 * Vrai si cette requête mérite d'être écrite sur le disque.
 *
 * Trois refus, pour trois raisons différentes :
 *   - la clé est sensible (voir ci-dessus) ;
 *   - la requête n'a pas de données réussies à offrir. Persister une erreur
 *     n'aurait aucun sens : au prochain démarrage on restaurerait une panne ;
 *   - la donnée ne survit pas au JSON (voir `survitAuJson`). La restaurer
 *     ferait planter la page au lieu de l'aider.
 */
export function doitPersister(query: Query): boolean {
  if (query.state.status !== 'success') return false
  if (estSensible(query.queryKey)) return false
  return survitAuJson(query.state.data)
}

// ---------------------------------------------------------------------------
// UN cache PAR COMPTE (2026-09-28, plan classeur-acces-par-classeur, étape 5)
// ---------------------------------------------------------------------------
//
// Le poste de la réception est PARTAGÉ. Avant ce jour, le cache survivait à
// la déconnexion et n'était pas rattaché à un compte : B pouvait voir
// s'afficher depuis le cache ce que A avait lu — jusqu'ici des données que B
// avait le droit de lire aussi (droits par PAGE), mais plus avec les accès
// par CLASSEUR (un classeur privé à A). Désormais :
//   - le cache est marqué du compte qui l'a écrit (`CLE_PROPRIETAIRE`) ;
//   - au démarrage, un cache d'un autre compte n'est pas restauré ;
//   - à chaque changement de compte ou déconnexion (`changerDeCompte`,
//     appelé par `AuthContext`), mémoire ET disque sont vidés.
// Une PANNE ne vide rien : le compte ne change pas (règle du 2026-09-05).

const CLE_PROPRIETAIRE = 'bo.query.cache.proprietaire'
let clientBranche: QueryClient | null = null

/** Identifiant du compte de la session enregistrée par supabase-js, sinon `null`. */
function compteDeLaSession(): string | null {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const cle = window.localStorage.key(i)
      if (cle === null || !/^sb-.+-auth-token$/.test(cle)) continue
      const brut = window.localStorage.getItem(cle)
      const session = brut === null ? null : (JSON.parse(brut) as unknown)
      const user =
        typeof session === 'object' && session !== null && 'user' in session
          ? (session as { user?: { id?: unknown } }).user
          : undefined
      return typeof user?.id === 'string' ? user.id : null
    }
  } catch {
    // Session illisible : traitée comme absente.
  }
  return null
}

/**
 * À appeler à chaque résolution du compte connecté (`null` = déconnecté).
 * Même compte : rien. Autre compte ou déconnexion : le cache (mémoire et
 * disque) est vidé AVANT que la page ne lise quoi que ce soit.
 */
export function changerDeCompte(userId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    const avant = window.localStorage.getItem(CLE_PROPRIETAIRE)
    if (userId !== null && avant === userId) return
    if (userId === null || avant !== userId) {
      clientBranche?.clear()
      window.localStorage.removeItem(CLE_STOCKAGE)
    }
    if (userId === null) window.localStorage.removeItem(CLE_PROPRIETAIRE)
    else window.localStorage.setItem(CLE_PROPRIETAIRE, userId)
  } catch {
    // Stockage indisponible : on vide au moins la mémoire si le compte change.
    if (userId === null) clientBranche?.clear()
  }
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
  clientBranche = queryClient

  try {
    for (const cle of CLES_PERIMEES) window.localStorage.removeItem(cle)
    // Le cache d'un AUTRE compte n'est même pas restauré (poste partagé).
    const session = compteDeLaSession()
    const proprietaire = window.localStorage.getItem(CLE_PROPRIETAIRE)
    // Propriétaire inconnu (cache d'avant le 2026-09-28) : traité comme étranger.
    if (proprietaire === null || proprietaire !== session) {
      window.localStorage.removeItem(CLE_STOCKAGE)
      window.localStorage.removeItem(CLE_PROPRIETAIRE)
    }

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
