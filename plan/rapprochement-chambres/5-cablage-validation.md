# Étape 5 — Câblage route + validation globale

## Objectif

Brancher le `RaproBoard` sur la route `/rapro` (à la place du `ComingSoon`), chaîner la feuille de styles, et valider l'ensemble du chantier (types + build).

## Contexte

La route `/rapro` existe déjà et est générée dans `src/routeTree.gen.ts` : il suffit de **changer le corps du composant**, aucune régénération de routeTree n'est nécessaire (elle ne l'est que si on ajoute/renomme/déplace un fichier de route). Ne pas mettre `ssr: false` (réservé à `/repjour` pour recharts/html2canvas) : comme caisse/pdj/parking, TanStack Query gère le fetch client. L'entrée de nav « Rapprochement » (`Navbar.tsx`) est déjà câblée — rien à faire côté menu.

## Fichier(s) impacté(s)

- `src/routes/rapro.tsx` (modifié)
- `src/styles.css` (modifié)

## Travail à réaliser

### 1. Route `/rapro`

Remplacer l'import et le corps :

```tsx
import { createFileRoute } from '@tanstack/react-router'

import { RaproBoard } from '#/components/rapro/RaproBoard.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'

export const Route = createFileRoute('/rapro')({
  component: RaproPage,
  head: () => ({ meta: [{ title: 'Rapprochement — Back Office' }] }),
})

function RaproPage() {
  return (
    <PageContainer>
      <RaproBoard />
    </PageContainer>
  )
}
```

Ajouter `printBleed` au `PageContainer` uniquement si la page doit s'imprimer plein cadre.

### 2. Chaîner le CSS

Dans `src/styles.css`, ajouter la ligne `@import './styles/rapro.css';` dans la chaîne d'imports, en respectant l'ordre alphabétique (entre `pdj.css` et `repjour.css`).

### 3. Validation globale

- `npx tsc --noEmit` (aucune erreur de type).
- `pnpm build` (vérifier qu'un chunk `rapro` apparaît et que le découpage par route est correct).
- `pnpm lint` / `pnpm check` si pertinent (ne pas introduire de régression de format).

## Ordre d'exécution

1. Modifier `src/routes/rapro.tsx`.
2. Ajouter l'`@import` dans `src/styles.css`.
3. `npx tsc --noEmit` puis `pnpm build`.
4. Test manuel par l'utilisateur : ouvrir `/rapro`, cocher des chambres, naviguer entre jours, vérifier la persistance et le gating par rôle.

## Critère de validation

- `/rapro` n'affiche plus `ComingSoon` mais la grille cochable fonctionnelle.
- Navigation par jour opérationnelle et bornée (pas de futur, pas avant le plus ancien enregistrement).
- `npx tsc --noEmit` et `pnpm build` verts, chunk `rapro` présent.
- Aucune régression sur les autres onglets (notamment PDJ, si D3=A a touché `lib/pdj/csv.ts`).

## Contrôle /borg

Étape critique (validation globale de fin de chantier). Auditer :

- Build et types verts, aucun import cassé (alias `#/` + extension explicite partout).
- Si D3=A : la page PDJ compile et affiche toujours ses 80 chambres (ré-export `ALL_ROOMS` transparent).
- Aucune écriture directe sur une table Supabase partagée introduite par le chantier ; toute persistance passe par `rapro_rooms` (table applicative) et la RLS super/admin.
- Les checkboxes sont bien en lecture seule pour le rôle `utilisateur` (garde UI + RLS).
