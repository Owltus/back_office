# Étape 3 — Board : import→upsert, chargement par jour, purge, gating rôle

## Objectif

Brancher `BreakfastBoard` sur Supabase : à l'import, upserter en base (au lieu du store mémoire) ; charger un jour via `useQuery` ; déclencher la purge RGPD au chargement ; permettre de consulter un jour précis (sélecteur) ; réserver l'import aux rôles autorisés.

## Contexte

Aujourd'hui le board lit `guests/fileName/dateMs` depuis `pdjStore` (mémoire), sans rôle. On remplace la source par Supabase (persistant, multi-jours). La donnée devient historisée → un sélecteur de jour est nécessaire (aujourd'hui il n'y a aucune navigation). Chargement via `useQuery` (convention perf : pas de `useEffect`+fetch, pas de Realtime — comme affiche).

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx` (modification : useQuery, import→importRows, purge, sélecteur de jour, canEdit)
- `src/lib/pdjStore.ts` (modification : réduit au jour sélectionné, ou retiré si l'état passe en state local/URL)

## Travail à réaliser

### 1. Gating par rôle (D6)

```ts
const { role } = useAuth()
const canEdit = role === 'super_utilisateur' || role === 'admin'
```

Import (drag-drop + input file) et purge conditionnés par `canEdit` + guard `if (!canEdit) return`. La consultation d'un jour reste ouverte à tous. La RLS reste le vrai rempart.

### 2. Chargement d'un jour via `useQuery` + purge au montage

- Liste des jours disponibles : `useQuery(['pdj', 'dates'], fetchServiceDates)`.
- Jour sélectionné (state local, défaut = le plus récent) : `useQuery(['pdj', 'day', selectedDate], () => fetchDay(selectedDate), { enabled: !!selectedDate })` → mapper en `GuestMap` pour le rendu existant.
- Purge RGPD au montage (si `canEdit`) : appeler `purgeOldGuestNames(todayParis)` une fois, puis invalider les queries. Idempotent, silencieux si rien à purger.
- Un petit sélecteur de jour (Select ou flèches préc./suiv.) remplace l'unique date figée ; l'impression garde `Breakfast_JJ-MM-AAAA` du jour affiché.

### 3. Import → upsert Supabase

```ts
async function loadFile(file: File) {
  if (!canEdit) return
  const content = await file.text()
  const rows = csvToDbRows(content, file.name) // lève si date non extractible
  await importRows(rows)
  await queryClient.invalidateQueries({ queryKey: ['pdj'] })
  setSelectedDate(rows[0]?.service_date ?? selectedDate)
}
```

- La zone d'import (drag-drop / input) n'est montrée qu'à `canEdit`. En lecture seule, on affiche le jour sélectionné sans zone d'import.
- Réimport du même jour = upsert (pas de doublon). Un import passé n'écrit aucun nom (règle D2) mais met à jour les stats.
- Gérer l'erreur « date non extractible du nom de fichier » par un message clair (ne pas dater en silence sur aujourd'hui).

### 4. Devenir de `pdjStore`

Le store mémoire n'est plus la source de vérité. Deux options : le réduire à l'UI (jour sélectionné) ou le supprimer et porter `selectedDate` en state local/URL. Nettoyer `setPdjData`/`resetPdjData` et leurs usages.

### 5. Suivi de consommation digital (D4)

Rendre les repères d'impression interactifs à l'écran : par chambre, un contrôle (cases cliquables ou +/-) fixe `breakfasts_served` (0..`guests`), persisté via `setServed(service_date, room, n)` puis invalidation. `served` en dérive (`> 0`). Afficher un compteur « servis / inclus » par chambre et une synthèse « PDJ servis du jour ».

Contraintes :
- L'écriture de consommation passe par la même RLS que l'import → **super_utilisateur / admin** par défaut (D6). Caveat à valider : si le personnel de réception qui coche est en rôle `utilisateur`, il faudra une policy dédiée autorisant `utilisateur` à mettre à jour **uniquement** `breakfasts_served`/`served` (à faire seulement si demandé).
- La saisie de consommation ne doit jamais être écrasée par un réimport (garanti côté service : `importRows` exclut ces colonnes).

## Ordre d'exécution

1. Ajouter `useAuth`/`canEdit` + `useQueryClient` au board.
2. Brancher `useQuery` (dates + jour) + mapping `DbPdjRow[]` → `GuestMap`.
3. Câbler l'import sur `importRows` + invalidation + sélection du jour importé.
4. Ajouter la purge au montage (canEdit) et le sélecteur de jour.
5. Nettoyer `pdjStore` selon l'option retenue.
6. `npx tsc --noEmit`, `pnpm lint`, `pnpm check`.

## Critère de validation

- Importer le CSV daté persiste en base ; recharger la page conserve le jour (plus de perte au refresh).
- Un `utilisateur` ne voit pas la zone d'import ; un import forcé est refusé par la RLS.
- Le sélecteur permet de revenir sur un jour passé (noms déjà anonymisés, stats présentes).
- Réimporter le même fichier ne crée pas de doublon.
- `npx tsc --noEmit`, `pnpm lint`, `pnpm check` (Prettier) passent sur les fichiers touchés.
