import type { UserRole } from '#/lib/repjour/types.ts';

// On ré-exporte `UserRole` (défini dans types.ts) pour que ce module soit la
// source unique de vérité des questions de rôle (accueil + libellés).
export type { UserRole };

/**
 * Page d'accueil par rôle — source UNIQUE de vérité.
 *
 * La source standalone définissait trois `ROLE_HOME` divergents (dans `App`,
 * `LoginPage` et `ProtectedRoute`), ce qui provoquait des redirections
 * incohérentes selon le point d'entrée (correction D13 bug#3). On n'en garde
 * qu'un ici et toutes les cibles vivent sous l'îlot `/repjour`.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  utilisateur: '/repjour',
  // Le super_utilisateur atterrit sur l'import (sa page « métier » principale).
  // Invariant anti-boucle : ROLE_HOME[role] doit être accessible au rôle —
  // /repjour/import autorise `super_utilisateur` ET `admin` (cf. import.tsx),
  // donc super_utilisateur → /repjour/import ne provoque pas de redirection en
  // boucle.
  super_utilisateur: '/repjour/import',
  admin: '/repjour',
};

/** Libellés d'affichage des rôles (repris de la source AccountsPage/ProfilePage). */
export const ROLE_LABELS: Record<UserRole, string> = {
  utilisateur: 'Utilisateur',
  super_utilisateur: 'Super utilisateur',
  admin: 'Administrateur',
};
