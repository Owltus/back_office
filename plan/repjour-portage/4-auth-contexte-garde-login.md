# Étape 4 — Auth : contexte, garde par rôle, page de login

## Objectif

Porter l'authentification de repjour (session Supabase + profil/rôle) sous forme d'un `AuthContext` client-side, d'une garde de route par rôle, et d'une page de connexion `/repjour/login`. Corriger au passage les trois bugs d'auth de la source (D13).

## Contexte

Le Back Office n'a aucune auth (le `signOut` de `UserMenu` est orphelin, l'avatar « PL » est en dur). L'auth repjour est 100 % client-side (`localStorage`) : avec le SSR désactivé sur l'îlot `/repjour` (D1=A), elle se porte quasi telle quelle. La sécurité réelle reste assurée par les RLS Supabase ; la garde client est ergonomique. Bugs source à corriger : race de chargement du profil, `ProtectedRoute` qui laisse passer si `role===null`, trois `ROLE_HOME` divergents.

## Fichier(s) impacté(s)

- `src/components/repjour/AuthContext.tsx` (nouveau — provider + hook `useAuth`)
- `src/components/repjour/ProtectedRoute.tsx` (nouveau — garde par rôle)
- `src/lib/repjour/roles.ts` (nouveau — `UserRole`, `ROLE_HOME` unique, libellés de rôle)
- `src/routes/repjour/login.tsx` (nouveau)
- Sources fork : `src/contexts/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, `src/pages/LoginPage.tsx`

## Travail à réaliser

### 1. `roles.ts` — source unique de vérité

Centraliser `UserRole`, un unique `ROLE_HOME` (résout la divergence des trois définitions source — D13), et les libellés de rôle. Choisir une cible cohérente pour chaque rôle sous `/repjour` : `utilisateur → /repjour`, `super_utilisateur → /repjour/import`, `admin → /repjour`.

### 2. `AuthContext.tsx` — session + profil (bug de race corrigé)

Porter l'`AuthContext` : `supabase.auth.getSession()` au montage, abonnement `onAuthStateChange`, chargement du profil via `profiles`. **Correction D13** : attendre (`await`) le chargement du profil avant de passer `loading` à `false`, pour que le rôle soit disponible quand la garde s'exécute. Exposer `user`, `profile`, `role`, `loading`, `signIn`, `signOut`, `refreshProfile`.

### 3. `ProtectedRoute.tsx` — garde par rôle (passthrough corrigé)

Porter la garde : `loading` → spinner ; `!user` → redirection `/repjour/login` ; `role === null` → **rester en attente** (spinner), ne pas afficher le contenu (correction D13) ; `role` non autorisé → redirection vers `ROLE_HOME[role]`. Utiliser la navigation TanStack Router (`redirect` / `useNavigate`).

### 4. Route de login

Créer `src/routes/repjour/login.tsx` : formulaire email/mot de passe → `signIn`, redirection vers `ROLE_HOME[role]` une fois le rôle connu. Cette route n'est **pas** enveloppée par `ProtectedRoute` (elle est accessible non connecté), mais vit sous le layout `/repjour` qui fournit l'`AuthProvider` (voir étape 5).

## Ordre d'exécution

1. `roles.ts`.
2. `AuthContext.tsx` (avec correction de la race).
3. `ProtectedRoute.tsx` (avec correction du passthrough).
4. `routes/repjour/login.tsx`.
5. Typecheck.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Connexion réelle contre le Supabase partagé : un compte de test se connecte, le rôle est chargé, la redirection mène au bon `ROLE_HOME`.
- Une route protégée n'affiche jamais son contenu tant que `role` est `null` (pas de flash).
- `signOut` ramène à `/repjour/login`.
- Un seul `ROLE_HOME` dans tout le code (aucune redéfinition).

## Contrôle /borg

Étape critique (met en place la garde de sécurité de l'îlot). Audit post-exécution :

- La garde ne laisse passer aucun contenu protégé avant résolution du rôle (vérifier les états `loading` et `role===null`).
- Aucune information sensible transitée côté client au-delà de ce que les RLS autorisent déjà (la garde est ergonomique, la RLS reste la barrière réelle).
- La session est bien isolée dans `localStorage` sous une clé propre ; aucun impact sur les autres onglets du Back Office.
- Aucune écriture ni requête de schéma introduite.
