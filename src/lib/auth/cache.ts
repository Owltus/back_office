import type { PagePermissions } from '#/lib/permissions/index.ts'
import type { Profile } from '#/lib/repjour/types.ts'

/* --------------------------------------------------------------------------
 * Cache local de l'accès (profil + droits par page).
 *
 * Extrait d'`AuthContext` le 2026-09-09 pour être lisible HORS React : le
 * `beforeLoad` de la racine est un hook du ROUTEUR, exécuté hors de l'arbre
 * React, et doit pourtant connaître la page d'accueil du compte pour rediriger
 * du premier coup (cf. lib/auth/homeTarget.ts). Le code est déplacé tel quel,
 * `AuthContext` en reste le seul écrivain.
 *
 * Le cache est une OPTIMISATION, jamais une source de vérité : au rechargement,
 * profil et droits sont disponibles immédiatement, la RPC ne fait que
 * réconcilier en arrière-plan. Toute lecture peut légitimement rendre `null`
 * (premier démarrage, navigation privée, stockage indisponible) et chaque accès
 * est donc protégé.
 * ------------------------------------------------------------------------ */

export const PROFILE_CACHE_KEY = 'bo.auth.profile.v1'

export function readCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    // localStorage indisponible (SSR, mode privé) : non bloquant.
    return null
  }
}

export function writeCachedProfile(profile: Profile | null) {
  try {
    if (profile) {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY)
    }
  } catch {
    // Ignoré : le cache n'est qu'une optimisation, jamais une source de vérité.
  }
}

/**
 * Droits par page, stockés avec l'`userId` pour ne JAMAIS servir les droits
 * d'un autre compte (poste partagé — le compte « Réception » l'est).
 */
export const PERMS_CACHE_KEY = 'bo.auth.perms.v1'

export function readCachedPerms(userId: string): PagePermissions | null {
  try {
    const raw = localStorage.getItem(PERMS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { userId: string; perms: PagePermissions }
    return parsed.userId === userId ? parsed.perms : null
  } catch {
    return null
  }
}

export function writeCachedPerms(userId: string, perms: PagePermissions) {
  try {
    localStorage.setItem(PERMS_CACHE_KEY, JSON.stringify({ userId, perms }))
  } catch {
    // Ignoré : cache = optimisation, jamais source de vérité.
  }
}

export function clearCachedPerms() {
  try {
    localStorage.removeItem(PERMS_CACHE_KEY)
  } catch {
    // Ignoré.
  }
}
