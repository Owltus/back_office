# Étape 5 — Gardes de navigation, navbar filtrée, redirection d'accueil

## Objectif

Faire respecter, côté navigation, le principe « ne voir que les pages accordées » : masquer les onglets non autorisés, **bloquer l'accès direct par URL** (pas seulement le lien), rediriger l'accueil vers la première page accordée, et généraliser la garde de route de « rôle global » vers « page + niveau requis ».

## Contexte

Deux trous à combler. (1) La navbar montre les 6 pages métier à tout le monde (`Navbar.tsx:50`, filtre admin seul) — il faut la dériver des droits. (2) Cinq pages (PDJ, Parking, Rapro, Caisse, Affichage) n'ont **aucune garde de route** : une fois l'onglet masqué, l'URL resterait accessible. On introduit `PageGuard`, qui remplace `ProtectedRoute` (dont le nom et l'emplacement `components/repjour/` sont trompeurs pour un usage transverse) et raisonne en (page, niveau minimum) plutôt qu'en `allowedRoles`.

## Fichier(s) impacté(s)

- `src/components/auth/PageGuard.tsx` (nouveau — garde par page/niveau)
- `src/components/repjour/ProtectedRoute.tsx` (déprécié : remplacé, ou conservé en fin adapteur `admin`-grade pour `/comptes`)
- `src/components/Navbar.tsx` (modification : items dérivés de `canView`)
- `src/components/UserMenu.tsx` (modification : `/comptes` conditionné au grade admin)
- `src/routes/{pdj,parking,rapro,caisse}/index.tsx`, `src/routes/affichage.tsx` (ajout de `PageGuard`)
- `src/routes/{repjour/index,facturation/index,artefact}.tsx` et sous-routes analytiques (migration `ProtectedRoute` → `PageGuard`)
- `src/routes/index.tsx` (redirection `/` → première page accordée au lieu de `/repjour` en dur)
- `src/lib/repjour/roles.ts` (`ROLE_HOME` remplacé par la logique « première page accordée »)

## Travail à réaliser

### 1. Composant `PageGuard`

```tsx
export function PageGuard({ page, min = 'lecture', children }: {
  page: PageKey
  min?: PageLevel
  children: ReactNode
}) {
  const { user, loading, permissionsLoading, can, permissions, grade } = useAuth()
  if (loading) return <GuardSkeleton />
  if (!user) return <Navigate to="/login" replace />
  if (permissionsLoading && !can(page, 'lecture')) return <GuardSkeleton />
  if (!can(page, min)) {
    const home = firstAllowedPage(permissions, grade)
    return home ? <Navigate to={PAGE_BY_KEY[home].route} replace /> : <NoAccessNotice />
  }
  return <>{children}</>
}
```

- `min` par défaut `lecture` : la plupart des pages exigent juste « voir ». Le raffinement des actions se fait dans le board (Étape 6), pas ici.
- `NoAccessNotice` : écran « Vous n'avez accès à aucune page — contactez un administrateur » (remplace `NoRoleNotice`).

### 2. Appliquer la garde à TOUTES les routes de page

Chaque route de page navbar enveloppe son board dans `<PageGuard page="…">`. Les 5 pages aujourd'hui non gardées (pdj/parking/rapro/caisse/affichage) l'obtiennent — c'est ce qui ferme l'accès URL. Facturation/Artefact passent de `ProtectedRoute[admin]` à `PageGuard page="facturation|artefact"` (accordables à des non-admins, décision de périmètre).

### 3. Navbar dérivée des droits

Remplacer `NAV_ITEMS`/`ADMIN_ITEMS` + le filtre `role === 'admin'` par :

```tsx
const navItems = PAGES.filter(p => can(p.key, 'lecture'))
```

Un `admin` voit tout (grade → Gestion partout via `can`) ; un utilisateur ne voit que ses pages. Même liste pour desktop et tiroir mobile.

### 4. Redirection d'accueil

`/` et le logo pointent vers `firstAllowedPage()` au lieu de `/repjour` en dur. `login.tsx` (`beforeLoad` qui renvoie les connectés) vise la même cible. Cas « aucune page » → `NoAccessNotice`.

### 5. UserMenu

`/profil` (tous) et `/gestion` (tous, édition selon grade — Étape 6) restent. `/comptes` reste conditionné `grade === 'admin'`.

## Ordre d'exécution

1. Créer `PageGuard` + `NoAccessNotice`.
2. Migrer les routes existantes de `ProtectedRoute` vers `PageGuard` ; ajouter la garde aux 5 routes non gardées.
3. Dériver la navbar de `PAGES` + `can`.
4. Rebrancher la redirection d'accueil (`/`, logo, login).
5. `pnpm generate-routes` si nécessaire (ajout/retrait de garde n'ajoute pas de route, mais vérifier).

## Critère de validation

- Un utilisateur avec seulement `parking` en Lecture : ne voit que Parking dans la navbar ; taper `/caisse` le redirige vers `/parking` ; `/` l'amène sur `/parking`.
- Un utilisateur sans aucune page : voit `NoAccessNotice`, aucune navbar exploitable.
- Un `admin` : voit les 8 pages, accès total.
- Aucune divergence d'hydratation (SSR rend le skeleton, comme aujourd'hui).
- `npx tsc --noEmit` + `pnpm build` verts.

## Contexte complémentaire

Cette étape assure la cohérence « visibilité » ; l'étanchéité en écriture est déjà en base (Étape 2) et le raffinement des actions dans les boards (Étape 6). Un utilisateur qui forcerait l'URL d'une page non accordée est redirigé ; même s'il contournait la redirection (client), la RLS le bloquerait en écriture.
