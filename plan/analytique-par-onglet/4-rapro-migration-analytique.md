# Étape 4 — Rapro : migration de `/rapro-mois` vers `/rapro/analytique`

## Objectif

Aligner Rapro sur les autres onglets : déplacer la vue analytique existante de la
route sœur `/rapro-mois` vers l'URL enfant `/rapro/analytique`, et repointer le
bouton « Analytique » du `RaproBoard`. Aucun nouveau board à écrire — les
composants existants sont réutilisés tels quels (D1).

## Contexte

Rapro possède déjà une vue analytique fonctionnelle : `RaproAnalytiqueBoard`
(route `routes/rapro-mois/index.tsx`) et `RaproMonthlyBoard`
(route `routes/rapro-mois/$year.$month.tsx`), avec export PDF ELIOR. Mais l'URL est
une route sœur top-level (`/rapro-mois`), pas une route enfant, et le bouton
`LineChart` du `RaproBoard` (lignes 465-471) pointe vers `/rapro-mois`. Cette étape
migre le tout sous `/rapro/analytique` pour la cohérence, sans toucher au métier
(`lib/rapro/*`). Le `RaproBoard` a déjà tous les imports nécessaires (`Link`,
`LineChart`, `Tip`).

## Fichier(s) impacté(s)

- `src/routes/rapro.tsx` (modification : devient route layout `Outlet` + `ssr: false`)
- `src/routes/rapro/index.tsx` (nouveau : contenu actuel, `<PageContainer><RaproBoard /></PageContainer>`)
- `src/routes/rapro/analytique.index.tsx` (nouveau : migré depuis `rapro-mois/index.tsx`, route `/rapro/analytique/`)
- `src/routes/rapro/analytique.$year.$month.tsx` (nouveau : migré depuis `rapro-mois/$year.$month.tsx`)
- `src/routes/rapro-mois/index.tsx` (suppression)
- `src/routes/rapro-mois/$year.$month.tsx` (suppression)
- `src/components/rapro/RaproBoard.tsx` (modification : bouton repointé `/rapro-mois` → `/rapro/analytique`)

## Travail à réaliser

### 1. Convertir `routes/rapro.tsx` en layout + créer `routes/rapro/index.tsx`

Même patron qu'à l'étape 1 (sans `printBleed`). Parent = `Outlet` + `ssr: false` +
`head` ; `index.tsx` reprend `<PageContainer><RaproBoard /></PageContainer>`.

### 2. Migrer les deux routes analytique sous `rapro/`

Recréer le contenu de `rapro-mois/index.tsx` dans
`routes/rapro/analytique.index.tsx` avec `createFileRoute('/rapro/analytique/')`, et
`rapro-mois/$year.$month.tsx` dans `routes/rapro/analytique.$year.$month.tsx` avec
`createFileRoute('/rapro/analytique/$year/$month')`. Envelopper le contenu dans
`ProtectedRoute` (utilisateur/super/admin) pour s'aligner sur le gabarit repjour
(D4), si ce n'était pas déjà le cas. Le composant `RaproAnalytiqueBoard` doit
naviguer vers `/rapro/analytique/$year/$month` (au lieu de `/rapro-mois/...`) :
adapter le `to=` de sa navigation ligne à ligne du tableau.

### 3. Supprimer l'ancien dossier `routes/rapro-mois/`

Supprimer `rapro-mois/index.tsx` et `rapro-mois/$year.$month.tsx` une fois la
migration confirmée. Vérifier qu'aucune autre référence à `/rapro-mois` ne subsiste
(recherche projet).

### 4. Repointer le bouton dans `RaproBoard.tsx`

Le bloc `Tip > Button > Link` existe déjà (lignes 465-471) : changer uniquement
`to="/rapro-mois"` en `to="/rapro/analytique"`. Aucun import à ajouter.

## Ordre d'exécution

1. Conversion `rapro.tsx` en layout + `rapro/index.tsx`.
2. Migration des deux routes analytique sous `rapro/analytique.*`.
3. Adaptation du `to=` de navigation dans `RaproAnalytiqueBoard`.
4. Repointage du bouton dans `RaproBoard.tsx`.
5. Suppression de `routes/rapro-mois/`.
6. `pnpm generate-routes`.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm lint`.
- `/rapro` affiche toujours le `RaproBoard` ; le bouton mène désormais à
  `/rapro/analytique`.
- `/rapro/analytique` et `/rapro/analytique/$year/$month` rendent les mêmes vues
  qu'avant, export PDF ELIOR inclus.
- `/rapro-mois` n'existe plus (404) et aucune référence résiduelle ne subsiste.

## Contrôle /borg

Étape critique (supprime des routes qui fonctionnent aujourd'hui). `/borg`
indisponible → audit manuel (D5) :

- Aucune référence orpheline à `/rapro-mois` (liens, `navigate`, tests).
- La navigation tableau → détail mensuel pointe bien vers `/rapro/analytique/...`.
- Le métier `lib/rapro/*` n'a pas été modifié (migration purement de routing/URL).
- `routeTree.gen.ts` régénéré ; anciennes entrées `rapro-mois` disparues.
