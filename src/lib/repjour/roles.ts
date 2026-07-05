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
  // Tous les rôles atterrissent sur le dashboard /repjour. L'import est intégré
  // au dashboard (sous le tableau) pour les rôles autorisés — il n'y a plus de
  // route /repjour/import dédiée.
  utilisateur: '/repjour',
  super_utilisateur: '/repjour',
  admin: '/repjour',
};

/** Libellés d'affichage des rôles (repris de la source AccountsPage/ProfilePage). */
export const ROLE_LABELS: Record<UserRole, string> = {
  utilisateur: 'Utilisateur',
  super_utilisateur: 'Super utilisateur',
  admin: 'Administrateur',
};
