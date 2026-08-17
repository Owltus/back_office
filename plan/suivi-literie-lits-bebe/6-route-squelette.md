# Étape 6 — Routes et squelette de page

## Objectif

Poser les routes `/literie` (grille + stock + feuille) et
`/literie/lits-bebe` (planning), gardées par permission, avec squelette de
chargement — sans logique métier encore. À l'issue, la page est accessible et
apparaît dans la navigation, mais affiche des zones vides.

## Fichier(s) impacté(s)

- `src/routes/literie.tsx` (nouveau) — layout `ssr:false`
- `src/routes/literie/index.tsx` (nouveau) — page grille literie
- `src/routes/literie/lits-bebe.tsx` (nouveau) — page planning lits bébé
- `src/styles/literie.css` (nouveau) — styles préfixés `.literie-*`
- `src/styles.css` (modifié) — `@import` du nouveau fichier

## Travail à réaliser

### 1. Layout et pages

Calqué sur `src/routes/rapro.tsx`/`src/routes/parking.tsx` : layout
`ssr:false` avec `<Outlet/>`, page index avec `validateSearch:
parseDateSearch` (le commentaire literie/feuille est daté), page
`lits-bebe` sans paramètre de date obligatoire (le planning couvre une
fenêtre glissante, pas un jour précis).

```tsx
// routes/literie/index.tsx
export const Route = createFileRoute('/literie/')({
  validateSearch: parseDateSearch,
  component: () => (
    <PageGuard page="literie">
      <PageContainer>
        <LiterieBoard initialDate={Route.useSearch().date} />
      </PageContainer>
    </PageGuard>
  ),
})
```

### 2. Navigation

Bouton dans l'en-tête de `LiterieBoard` (`PageHeader`) vers
`/literie/lits-bebe`, même mécanique que le bouton « Analytique » de
`/rapro`/`/parking` (pas d'onglets internes, cf. décision D1).

### 3. Squelette de chargement

`SkeletonBlock` (`components/shared/skeleton/`) le temps du premier chargement
— pattern anti-saut déjà généralisé (cf. `loading-skeleton-global`).

## Ordre d'exécution

1. `pnpm generate-routes` après création des fichiers de route.
2. Créer les composants `LiterieBoard`/`BabyCotBoard` comme coquilles vides
   (juste le squelette) — le contenu réel arrive aux étapes 7-9.

## Critère de validation

- `pnpm generate-routes` régénère `routeTree.gen.ts` sans erreur.
- `npx tsc --noEmit` sans erreur.
- Navigation manuelle : `/literie` et `/literie/lits-bebe` accessibles pour
  un compte avec permission `literie`, redirigées sinon.
