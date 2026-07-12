# Étape 1 — PDJ : page analytique (pilote, établit le pattern)

## Objectif

Créer la page `/pdj/analytique` sur le gabarit `/repjour/analytique`, et ajouter le
bouton « Analytique » dans la barre d'action du `BreakfastBoard`. Cette étape est le
pilote : elle fige le patron (conversion route feuille → layout, lecture
multi-jours, board analytique, bouton) que les étapes 2 à 4 répliqueront.

## Contexte

`routes/pdj.tsx` est aujourd'hui une route feuille qui rend directement
`<PageContainer printBleed><BreakfastBoard /></PageContainer>` : sans `Outlet`,
elle ne peut pas afficher d'enfant `/pdj/analytique`. Le service PDJ
(`lib/pdj/service.ts`) ne sait lire qu'un seul jour (`fetchDay`) ; une vue
analytique a besoin d'une lecture sur une plage de dates. Les données exploitables
(table `pdj_breakfasts`, axe `service_date`) : PDJ servis vs inclus vs potentiel,
occupation (rooms / 80), mix recouche/départ, VIP. La profondeur d'historique
dépend des imports et n'est pas garantie.

## Fichier(s) impacté(s)

- `src/routes/pdj.tsx` (modification : devient route layout `Outlet` + `ssr: false`, D2)
- `src/routes/pdj/index.tsx` (nouveau : contenu actuel, `<PageContainer printBleed><BreakfastBoard /></PageContainer>`)
- `src/routes/pdj/analytique.index.tsx` (nouveau : route `/pdj/analytique/`, garde `ProtectedRoute`, D4)
- `src/lib/pdj/service.ts` (modification : ajout d'une lecture multi-jours, D3)
- `src/components/pdj/PdjAnalytiqueBoard.tsx` (nouveau : board analytique, gabarit repjour)
- `src/components/pdj/BreakfastBoard.tsx` (modification : bouton « Analytique » dans `actions`)

## Travail à réaliser

### 1. Convertir `routes/pdj.tsx` en route layout

Reproduire le patron de `routes/repjour.tsx` : la route parent ne rend qu'un
`Outlet`, en `ssr: false` (recharts côté navigateur), avec `head` pour le titre.

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/pdj')({
  ssr: false,
  head: () => ({ meta: [{ title: 'PDJ — Back Office' }] }),
  component: PdjLayout,
})

function PdjLayout() {
  return <Outlet />
}
```

### 2. Déplacer le contenu actuel dans `routes/pdj/index.tsx`

Nouvelle route `/pdj/` reprenant exactement le rendu retiré de `pdj.tsx` (conserver
`printBleed`) :

```tsx
export const Route = createFileRoute('/pdj/')({
  component: () => (
    <PageContainer printBleed>
      <BreakfastBoard />
    </PageContainer>
  ),
})
```

### 3. Ajouter la lecture multi-jours dans `lib/pdj/service.ts`

Ajouter une fonction `select`-seule sur une plage (aucune écriture) :

```ts
export async function fetchRange(from: string, to: string): Promise<PdjDayRow[]> {
  const { data, error } = await supabase
    .from('pdj_breakfasts')
    .select('*')
    .gte('service_date', from)
    .lte('service_date', to)
    .order('service_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as PdjDayRow[]
}
```

Prévoir aussi la réutilisation de `fetchServiceDates()` pour alimenter le sélecteur
d'année/période et mesurer la profondeur réelle de l'historique.

### 4. Créer `components/pdj/PdjAnalytiqueBoard.tsx`

Copier la structure de `components/repjour/boards/AnalytiqueBoard.tsx` :
`PageContainer > div.mx-auto.w-full.max-w-5xl.space-y-6 > PageHeader` (titre
« Analytique », sélecteur de période en `actions`) ; pendant le chargement
`BoardSkeleton` ; sinon la grille de cartes de synthèse
(`grid grid-cols-2 gap-3 sm:grid-cols-4`), un tableau par mois, puis des
`KpiLineChart` (`grid grid-cols-1 gap-4 lg:grid-cols-2`). Données via `useQuery`,
clé `['pdj', 'analytics', <période>]`, agrégation en mémoire par `service_date`.
Métriques MVP : PDJ servis / inclus / potentiel, taux d'occupation, mix
recouche/départ. Réutiliser `KpiLineChart` et `fmt` tels quels.

### 5. Créer la route `routes/pdj/analytique.index.tsx`

Sur le modèle de `routes/repjour/analytique.index.tsx` : garde de rôle puis board.

```tsx
export const Route = createFileRoute('/pdj/analytique/')({
  head: () => ({ meta: [{ title: 'Analytique — PDJ' }] }),
  component: () => (
    <ProtectedRoute allowedRoles={['utilisateur', 'super_utilisateur', 'admin']}>
      <PdjAnalytiqueBoard />
    </ProtectedRoute>
  ),
})
```

### 6. Ajouter le bouton « Analytique » dans `BreakfastBoard.tsx`

Insérer en PREMIER dans la prop `actions` du `PageHeader` (avant `PrintButton`),
bloc identique à repjour :

```tsx
<Tip label="Vue analytique">
  <Button asChild variant="outline" size="icon-sm">
    <Link to="/pdj/analytique" aria-label="Vue analytique">
      <LineChart />
    </Link>
  </Button>
</Tip>
```

Ajouter les imports manquants : `Link` depuis `@tanstack/react-router` et
`LineChart` depuis `lucide-react` (`Tip` est déjà importé).

## Ordre d'exécution

1. `service.ts` (`fetchRange`).
2. `PdjAnalytiqueBoard.tsx`.
3. Conversion `pdj.tsx` en layout + `pdj/index.tsx`.
4. `pdj/analytique.index.tsx`.
5. Bouton dans `BreakfastBoard.tsx`.
6. `pnpm generate-routes` (ou laisser Vite régénérer).

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm lint`.
- `/pdj` affiche toujours le `BreakfastBoard` (aucune régression), avec un nouveau
  bouton-icône `LineChart` dans la barre.
- Le bouton mène à `/pdj/analytique` ; la page rend cartes + tableau + graphiques
  sans erreur, alimentés par la lecture multi-jours.
- Aucune écriture Supabase introduite (uniquement des `select`).

## Contrôle /borg

Étape critique (pilote, >5 fichiers, conversion d'une route feuille en service).
`/borg` étant indisponible, audit manuel post-exécution (D5) :

- La conversion de `pdj.tsx` n'a pas cassé l'accès à `/pdj` ni le `printBleed`.
- `ssr: false` bien posé (pas de rendu recharts côté serveur).
- `fetchRange` est strictement en lecture ; pas d'`insert`/`update`/`upsert`.
- `queryKey` versionnée `['pdj', 'analytics', ...]` conforme à la convention.
- Régénération de `routeTree.gen.ts` effectuée, fichier non édité à la main.
