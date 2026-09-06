import type { Profile } from '#/lib/repjour/types.ts'
import type {
  PageKey,
  PageLevel,
  PagePermissions,
} from '#/lib/permissions/index.ts'

/**
 * Accès de l'utilisateur courant, tel que renvoyé par la RPC `get_my_access()`
 * (perf_audit_2026-09-06.sql) : profil + droits par page en UN aller-retour au
 * lieu de deux (les deux lectures séparées représentaient 68 % des requêtes
 * REST de l'application).
 *
 * Trois issues à distinguer côté appelant, sans jamais les confondre :
 *  - erreur réseau / panne → on ne touche à rien (ni état, ni cache) ;
 *  - `profile === null` → le profil n'existe plus : ÉJECTION (compte supprimé) ;
 *  - `permissions` vide → état LÉGITIME (aucune page accordée), jamais d'éjection.
 */
export interface MyAccessRow {
  page: PageKey
  level: PageLevel
}

export interface MyAccess {
  profile: Profile | null
  permissions: PagePermissions
}

/** Réduit les lignes `user_page_permissions` en carte page → niveau. */
export function toPagePermissions(
  rows: ReadonlyArray<unknown> | null | undefined,
): PagePermissions {
  const map: PagePermissions = {}
  for (const row of rows ?? []) {
    if (typeof row !== 'object' || row === null) continue
    const { page, level } = row as Partial<MyAccessRow>
    if (typeof page === 'string' && typeof level === 'string') {
      map[page] = level
    }
  }
  return map
}

/**
 * Analyse la charge utile brute de `get_my_access()`. Une réponse absente ou
 * mal formée est une ERREUR (à traiter comme un aléa réseau), jamais un
 * « profil supprimé » : sinon un simple incident déconnecterait l'utilisateur.
 */
export function parseMyAccess(data: unknown): MyAccess {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('get_my_access : réponse vide ou invalide')
  }
  const payload = data as {
    profile?: Profile | null
    permissions?: unknown[] | null
  }
  if (!('profile' in payload)) {
    throw new Error('get_my_access : champ profile absent')
  }
  return {
    profile: payload.profile ?? null,
    permissions: toPagePermissions(payload.permissions),
  }
}
