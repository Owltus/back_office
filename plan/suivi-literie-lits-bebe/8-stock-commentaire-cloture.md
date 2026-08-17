# Étape 8 — Stock, commentaire et clôture du jour

## Objectif

Compléter le bas de la page `/literie` : compteur de stock + historique des
mouvements, commentaire du jour, bouton de clôture/réouverture — même
principe que le bas de page `/rapro`, demandé explicitement par
l'utilisateur.

## Fichier(s) impacté(s)

- `src/lib/literie/editability.ts` (nouveau) — fenêtre de grâce clôture
- `src/lib/literie/format.ts` (nouveau)
- `src/lib/literie/service.ts` (modifié — ajout des fonctions feuille/stock)
- `src/components/literie/StockCard.tsx` (nouveau)
- `src/components/literie/LiterieCommentCard.tsx` (nouveau)
- `src/components/literie/LiterieBoard.tsx` (modifié — intégration bas de page)

## Travail à réaliser

### 1. Fenêtre d'édition de la clôture

```ts
// editability.ts — miroir de lib/rapro/editability.ts
export function canCloseDay(
  date: string, today: string, level: PageLevel,
): boolean {
  if (level === 'gestion') return true
  if (level !== 'ecriture') return false
  return withinGraceDays(date, today, LITERIE_GRACE_DAYS)
}
```

### 2. Carte stock

`StockCard.tsx` : `StatTile` × 2 (oreillers restants, couettes restantes),
liste des derniers mouvements (`literie_stock_movements`, triés
`created_at desc`, limite raisonnable ex. 20 dernières lignes).

### 3. Commentaire du jour

`LiterieCommentCard.tsx` : réplique du pattern `RaproCommentCard` — état
local isolé (frappe ne re-render pas le board), commit au blur via
`saveComment(reportDate, comment)` (upsert `literie_sheets`), mise à jour
optimiste du cache React Query.

### 4. Clôture / réouverture

Réutilisation directe de `CloseSheetDialog` (`components/shared/`) — pas de
nouveau composant de modal. `closeIssues` pour cette page : à minima « stock
à 0 alors qu'une chambre attend encore une mise en place » si détectable
simplement, sinon liste vide (verdict vert) — pas de logique d'écart complexe
comme `/rapro`. Bouton rendu en bas du flux (`LiterieBoard.tsx`), sous
`LiterieCommentCard`, avec `LockBadge` dans le `PageHeader`.

## Ordre d'exécution

1. `editability.ts` → `format.ts` → extension `service.ts`.
2. `StockCard.tsx`, `LiterieCommentCard.tsx` en parallèle (indépendants).
3. Intégration finale dans `LiterieBoard.tsx`.

## Critère de validation

- `npx tsc --noEmit` et `npx vitest run src/lib/literie` sans erreur.
- Clôturer un jour verrouille la grille pour un compte `ecriture` (RLS +
  garde front), reste modifiable pour `gestion`.
- Réouvrir un jour clos fonctionne et remet `validated_at`/`validated_by`
  à `null` en base.
- Le commentaire survit à un rechargement de page.
