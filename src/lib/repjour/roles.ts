import type { UserRole } from '#/lib/repjour/types.ts';

// On ré-exporte `UserRole` (défini dans types.ts) pour que ce module soit la
// source unique de vérité des questions de rôle (libellés). L'accueil, lui,
// vient de `homePage` (lib/permissions/navigation.ts) : droits + ordre du compte.
export type { UserRole };

/** Libellés d'affichage des rôles (repris de la source AccountsPage/ProfilePage). */
export const ROLE_LABELS: Record<UserRole, string> = {
  utilisateur: 'Utilisateur',
  admin: 'Administrateur',
};
