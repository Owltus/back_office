import type { Grade, PageLevel } from '#/lib/permissions/levels.ts'
import { atLeastLevel } from '#/lib/permissions/levels.ts'
import type { PageKey } from '#/lib/permissions/pages.ts'
import { PAGES } from '#/lib/permissions/pages.ts'

export * from '#/lib/permissions/levels.ts'
export * from '#/lib/permissions/pages.ts'

// Carte des droits d'un utilisateur : niveau par page accordée (page absente =
// aucun accès). Miroir applicatif de la table user_page_permissions.
export type PagePermissions = Partial<Record<PageKey, PageLevel>>

// Une ligne de user_page_permissions, telle que lue depuis Supabase.
export interface UserPagePermission {
  user_id: string
  page: PageKey
  level: PageLevel
}

// Niveau effectif de l'utilisateur sur une page : un grade 'admin' a 'gestion'
// partout ; sinon le niveau accordé (ou null = aucun accès). Miroir exact de la
// fonction SQL get_page_level — la décision est prise aux DEUX bouts.
export function levelOf(perms: PagePermissions, grade: Grade, page: PageKey): PageLevel | null {
  if (grade === 'admin') return 'gestion'
  return perms[page] ?? null
}

// L'utilisateur peut-il au moins VOIR la page ?
export function canView(perms: PagePermissions, grade: Grade, page: PageKey): boolean {
  return levelOf(perms, grade, page) !== null
}

// L'utilisateur a-t-il au moins le niveau `min` sur la page ?
export function atLeast(
  perms: PagePermissions,
  grade: Grade,
  page: PageKey,
  min: PageLevel,
): boolean {
  return atLeastLevel(levelOf(perms, grade, page), min)
}

// Première page accordée dans l'ordre du REGISTRE (null si aucune).
//
// Depuis le 2026-09-09, la page d'accueil d'un compte est la tête de SON ordre
// (`homePage`, lib/permissions/navigation.ts) : cette fonction n'en est plus
// que le cas particulier « aucune préférence ». Elle reste le repli utilisé
// quand la préférence n'est pas encore connue — au démarrage, ou pendant une
// panne du backend.
export function firstAllowedPage(perms: PagePermissions, grade: Grade): PageKey | null {
  return PAGES.find((p) => canView(perms, grade, p.key))?.key ?? null
}
