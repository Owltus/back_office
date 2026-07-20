import type { UserRole } from '#/lib/repjour/types.ts'

// Niveau d'accès d'un utilisateur SUR une page donnée. Ordre : lecture < ecriture
// < gestion. Mêmes valeurs qu'en base (user_page_permissions.level).
export type PageLevel = 'lecture' | 'ecriture' | 'gestion'

// Grade de compte. 'admin' = super-administrateur (accès total partout + gestion
// des comptes). 'utilisateur' = accès défini page par page.
export type Grade = 'admin' | 'utilisateur'

export const PAGE_LEVELS: PageLevel[] = ['lecture', 'ecriture', 'gestion']

export const LEVEL_LABELS: Record<PageLevel, string> = {
  lecture: 'Lecture',
  ecriture: 'Écriture',
  gestion: 'Gestion',
}

export const GRADES: Grade[] = ['utilisateur', 'admin']

export const GRADE_LABELS: Record<Grade, string> = {
  utilisateur: 'Utilisateur',
  admin: 'Administrateur',
}

const RANK: Record<PageLevel, number> = { lecture: 1, ecriture: 2, gestion: 3 }

// Rang numérique d'un niveau (0 = aucun accès). Miroir de public.page_level_rank.
export function levelRank(level: PageLevel | null | undefined): number {
  return level ? RANK[level] : 0
}

// « level est-il au moins min ? » (ex. atLeastLevel(x, 'ecriture')).
export function atLeastLevel(level: PageLevel | null | undefined, min: PageLevel): boolean {
  return levelRank(level) >= RANK[min]
}

// Grade dérivé du rôle stocké : seul 'admin' est un grade admin ; tout le reste
// ('utilisateur', 'super_utilisateur' legacy) est un grade utilisateur.
export function gradeOf(role: UserRole | null | undefined): Grade {
  return role === 'admin' ? 'admin' : 'utilisateur'
}
