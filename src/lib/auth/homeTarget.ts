import { readCachedPerms, readCachedProfile } from '#/lib/auth/cache.ts'
import { gradeOf } from '#/lib/permissions/levels.ts'
import { homeRoute } from '#/lib/permissions/navigation.ts'

/* --------------------------------------------------------------------------
 * Cible d'accueil, calculable HORS React.
 *
 * `beforeLoad` (routes/index.tsx, routes/login.tsx) est un hook du ROUTEUR : il
 * s'exécute hors de l'arbre React et n'a donc aucun accès à `AuthContext`. Il
 * lui faut pourtant la page d'accueil du compte, sinon la racine redirige vers
 * une cible fixe puis `PageGuard` corrige — c'est le double saut visible
 * aujourd'hui par le compte n'ayant droit qu'au parking.
 *
 * La lecture se fait donc dans le CACHE local, alimenté par `AuthContext` à
 * chaque résolution d'accès. Elle est synchrone et instantanée : aucun
 * aller-retour réseau n'est ajouté au démarrage (l'audit du 2026-09-06 avait
 * justement ramené deux lectures REST à une seule).
 *
 * Ceci n'est possible que parce que l'application est une SPA : `vite.config.ts`
 * active `spa: { enabled: true }`, `vercel.json` réécrit toutes les URL vers
 * `_shell.html`, et `dist/client` ne contient aucune page prérendue — le
 * `beforeLoad` s'exécute donc côté client, là où `localStorage` existe. Si le
 * projet repassait un jour en rendu serveur par route, cette fonction rendrait
 * `null` côté serveur (les lecteurs de cache sont protégés) et la redirection
 * retomberait sur son repli : dégradé, jamais cassé.
 *
 * DERNIER POINT, le plus important : cette fonction ne fait que CHOISIR une
 * cible. Elle n'accorde aucun droit. `PageGuard` reste seul juge de ce que le
 * compte peut ouvrir, et la RLS seule juge de ce qu'il peut lire.
 * ------------------------------------------------------------------------ */

/**
 * Route d'accueil du compte d'après le cache local, ou `null` si elle n'est pas
 * connue — premier démarrage, cache vidé, stockage indisponible. L'appelant
 * décide alors de son repli.
 */
export function cachedHomeRoute(): string | null {
  const profile = readCachedProfile()
  if (!profile) return null
  const perms = readCachedPerms(profile.id) ?? {}
  return homeRoute(perms, gradeOf(profile.role), profile.page_order)
}

/**
 * Route par défaut quand rien n'est connu. Conserve le comportement d'avant le
 * chantier : au tout premier chargement, la cible reste `/repjour`, et
 * `PageGuard` corrigera si le compte n'y a pas droit — exactement comme
 * aujourd'hui, jamais pire.
 */
export const FALLBACK_HOME_ROUTE = '/repjour'

/** Cible d'accueil à donner au routeur : le cache s'il sait, le repli sinon. */
export function homeTarget(): string {
  return cachedHomeRoute() ?? FALLBACK_HOME_ROUTE
}
