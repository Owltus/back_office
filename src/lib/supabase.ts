import { createClient } from '@supabase/supabase-js'

import { backendHealth, isOutageStatus } from '#/lib/backendHealth.ts'
import { createLimiteur } from '#/lib/requestQueue.ts'

/**
 * Client Supabase partagé côté navigateur.
 *
 * Renseigner les clés dans un fichier `.env` (voir `.env.example`) :
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 *
 * Les variables préfixées `VITE_` sont exposées au client par Vite.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // On ne jette pas d'erreur pour laisser l'app démarrer sans clés,
  // mais on prévient clairement en console.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes — ' +
      'renseignez votre fichier .env pour activer Supabase.',
  )
}

/**
 * Délai maximal d'une requête vers Supabase (PostgREST, GoTrue, Storage).
 * Sans lui, une promesse pend ~100 s sous 522/504 (vécu le 2026-09-05).
 * 20 s suffisent largement à un refresh de jeton sain sur réseau lent ; au
 * delà, auth-js classe le `fetch` rejeté en `AuthRetryableFetchError` et
 * retente de lui-même (cooldown 60 s), sans intervention de l'application.
 */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * Plafond de lectures simultanées, PARTAGÉ par toute l'application.
 *
 * Six, parce qu'au-delà de neuf la base ne ralentit pas mais s'effondre
 * (débit divisé par 2,6, latence multipliée par quatre) et que le plafond est
 * par onglet : deux postes simultanés font douze, encore sous le seuil. Le
 * tableau de mesures complet est en tête de `lib/requestQueue.ts`.
 *
 * C'est le SEUL endroit où ce réglage existe : toute requête Supabase de
 * l'app — présente ou future, quelle que soit la page — passe par le `fetch`
 * ci-dessous. Aucune page n'a à s'en soucier.
 */
const limiteur = createLimiteur(6)

/**
 * Erreur levée quand le disjoncteur est ouvert : la requête n'est même pas
 * émise.
 *
 * `status: 503` n'est pas cosmétique — c'est ce qui la fait reconnaître comme
 * une PANNE par `isOutageError`, donc traiter comme telle par le bandeau, les
 * gardes et la politique de réessai. Sans lui, elle passerait pour une erreur
 * métier et afficherait un message inexact.
 */
class BackendIndisponible extends Error {
  readonly status = 503
  constructor() {
    super('Backend injoignable : requête non émise (disjoncteur ouvert).')
    this.name = 'BackendIndisponible'
  }
}

/** L'URL visée, quelle que soit la forme sous laquelle `fetch` la reçoit. */
function urlDe(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * `fetch` du client : file d'attente bornée + timeout + observation pour le
 * disjoncteur (`lib/backendHealth.ts`). Un 2xx/4xx prouve que le backend
 * répond (succès pour le disjoncteur, l'erreur métier remonte normalement) ;
 * un 5xx, un timeout ou une erreur réseau ouvrent le disjoncteur. Un abandon
 * demandé par l'APPELANT (annulation TanStack au démontage) n'est pas une
 * panne.
 */
/* Exporté UNIQUEMENT pour `supabase.test.ts` : c'est le point de passage de
   tout le trafic de l'app, et la règle du disjoncteur qu'il applique mérite un
   test qui puisse échouer. Ne pas l'appeler depuis le code applicatif — le
   client Supabase le branche déjà comme son `global.fetch`. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  /*
   * GoTrue reste HORS de la file, et ce n'est pas un détail : chaque requête
   * PostgREST attend déjà le jeton via `_getAccessToken`. Faire patienter un
   * renouvellement derrière six lectures de données inverserait les priorités
   * et pourrait, file pleine, bloquer l'app entière derrière son propre
   * verrou. L'authentification est rare et courte ; elle passe devant.
   */
  if (urlDe(input).includes('/auth/v1/')) return executerFetch(input, init)

  /*
   * ÉCHEC IMMÉDIAT QUAND LE DISJONCTEUR EST OUVERT — ajouté le 2026-09-24.
   *
   * Le disjoncteur existait depuis la panne du 2026-09-05, mais RIEN ne le
   * consultait sur le chemin des données : deux appelants seulement s'en
   * servaient (relecture des droits, canal parking). Pendant les quarante
   * minutes du 2026-09-24, chaque lecture partait donc quand même, attendait
   * son délai de garde de 20 s, échouait, puis était réessayée deux fois.
   * Une page en compte une vingtaine : environ soixante requêtes vouées à
   * l'échec, et plus d'une minute d'attente avant le moindre message — le
   * tout dirigé sur une base déjà à terre.
   *
   * Désormais, tant que la fenêtre de backoff court, on n'émet RIEN : l'échec
   * est instantané, l'utilisateur voit le bandeau tout de suite, et la base
   * cesse de recevoir du trafic pendant qu'elle se relève. C'est un
   * demi-ouvert naturel : `shouldSkip()` redevient faux à l'échéance, une
   * requête passe, et elle referme le disjoncteur ou rallonge la fenêtre
   * (1 s -> 30 s maximum).
   *
   * ⚠ `/auth/v1/` en est EXEMPTÉ, délibérément, et le test est placé APRÈS la
   * ligne ci-dessus pour que ce soit visible. L'authentification est la porte
   * d'entrée de l'application : un disjoncteur ouvert à tort y enfermerait
   * tout le monde dehors, alors que la tempête à éteindre est celle des
   * lectures de données. Le bouton « Réessayer » du bandeau
   * (`backendHealth.retryNow()`) reste la sortie de secours.
   */
  if (backendHealth.shouldSkip()) throw new BackendIndisponible()

  return limiteur.run(() => executerFetch(input, init))
}

/**
 * Le fetch réel. Séparé pour que le minuteur de 20 s démarre APRÈS l'obtention
 * du jeton de la file : sinon une requête sagement en attente consommerait son
 * propre délai de garde sans avoir encore rien demandé, et serait abandonnée
 * pour une lenteur qui n'est pas la sienne.
 */
async function executerFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const callerSignal = init?.signal ?? null
  const forward = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', forward, { once: true })
  }
  try {
    const res = await fetch(input, { ...init, signal: controller.signal })
    if (isOutageStatus(res.status)) backendHealth.reportFailure(res)
    else backendHealth.reportSuccess()
    return res
  } catch (err) {
    if (!callerSignal?.aborted) backendHealth.reportFailure(err)
    throw err
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', forward)
  }
}

export const supabase = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'public-anon-key',
  {
    global: { fetch: fetchWithTimeout },
    // Session persistée côté navigateur pour l'authentification de l'onglet
    // /repjour (rôles gérés par les RLS Supabase). Client-only : l'îlot
    // /repjour est rendu sans SSR.
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // false : le login se fait par signInWithPassword uniquement (aucun OAuth
      // ni magic-link), donc aucun token n'arrive jamais par l'URL. Inspecter
      // l'URL à chaque chargement serait une surface d'attaque gratuite (fixation
      // de session via fragment fabriqué). Repasser à true seulement si un flux
      // redirect (OAuth, lien magique, reset par lien) est ajouté un jour.
      detectSessionInUrl: false,
    },
  },
)
