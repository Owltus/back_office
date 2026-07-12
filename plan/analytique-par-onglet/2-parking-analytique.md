# Étape 2 — Parking : page analytique

## Objectif

Créer la page `/parking/analytique` sur le gabarit établi à l'étape 1, et ajouter
le bouton « Analytique » dans la barre d'action du `ParkingBoard`.

## Contexte

`routes/parking.tsx` est une route feuille (rend `<PageContainer><ParkingBoard /></PageContainer>`,
sans `printBleed`). Le service Parking (`lib/parking/service.ts`) charge déjà
TOUTES les réservations via `fetchReservations()` (clé `['parking','reservations']`)
— directement réutilisable pour une agrégation client. Données de la table
`parking_reservations` (axe `start_date`, `nights`, `spot` 1–14 dont 13/14
personnel, `status` reserve/paye/checkout). Limite forte (D3) : aucun montant en
base → pas de chiffre d'affaires ; les réservations annulées sont supprimées (donc
invisibles).

## Fichier(s) impacté(s)

- `src/routes/parking.tsx` (modification : devient route layout `Outlet` + `ssr: false`)
- `src/routes/parking/index.tsx` (nouveau : contenu actuel, `<PageContainer><ParkingBoard /></PageContainer>`)
- `src/routes/parking/analytique.index.tsx` (nouveau : route `/parking/analytique/`, garde `ProtectedRoute`)
- `src/components/parking/ParkingAnalytiqueBoard.tsx` (nouveau : board analytique)
- `src/components/parking/ParkingBoard.tsx` (modification : bouton « Analytique » + import `Tip`)

## Travail à réaliser

### 1. Convertir `routes/parking.tsx` en layout + créer `routes/parking/index.tsx`

Même patron qu'à l'étape 1 (sans `printBleed` pour parking). Parent = `Outlet` +
`ssr: false` + `head`. `index.tsx` reprend `<PageContainer><ParkingBoard /></PageContainer>`.

### 2. Créer `components/parking/ParkingAnalytiqueBoard.tsx`

Structure gabarit repjour (cartes + tableau + `KpiLineChart`). Données via
`useQuery` clé `['parking','analytics']`, réutilisant `fetchReservations()` puis
agrégation en mémoire par `start_date` (étalée sur `nights`). Métriques MVP (D3) :

- Taux d'occupation parking : places-nuits occupées / (12 places clients × jours),
  en isolant les places personnel 13/14 (`FIRST_STAFF_SPOT`).
- Rotation : nombre de réservations, durée moyenne (`nights`).
- Répartition par statut : payé / réservé / impayé (`checkout`) → taux de
  recouvrement en volume (pas en €).
- Occupation par place (`spot`).

Aucune métrique monétaire (à ne pas promettre).

### 3. Créer la route `routes/parking/analytique.index.tsx`

Modèle repjour : `ProtectedRoute` (`allowedRoles` utilisateur/super/admin) +
`<ParkingAnalytiqueBoard />`, `head` titre « Analytique — Parking ».

### 4. Ajouter le bouton « Analytique » dans `ParkingBoard.tsx`

Insérer en premier dans `actions` du `PageHeader`, avant `PrintButton`, bloc
`Tip > Button asChild variant="outline" size="icon-sm" > Link to="/parking/analytique" > LineChart`.
Imports à ajouter : `Link` (`@tanstack/react-router`), `LineChart` (`lucide-react`),
**et `Tip`** (`#/components/shared/Tip.tsx`, absent aujourd'hui).

## Ordre d'exécution

1. `ParkingAnalytiqueBoard.tsx`.
2. Conversion `parking.tsx` en layout + `parking/index.tsx`.
3. `parking/analytique.index.tsx`.
4. Bouton dans `ParkingBoard.tsx`.
5. `pnpm generate-routes`.

## Critère de validation

- `npx tsc --noEmit` sans erreur ; `pnpm lint`.
- `/parking` affiche toujours le `ParkingBoard` (drag/copie réservations
  intactes), avec le nouveau bouton dans la barre.
- Le bouton mène à `/parking/analytique` ; la page rend occupation, rotation et
  répartition par statut sans erreur ; aucune mention de chiffre d'affaires.
- Aucune écriture Supabase introduite.
