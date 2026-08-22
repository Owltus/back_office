# Étape 4 — PDJ : board jour responsive tactile

## Objectif

Câbler `BreakfastBoard.tsx` sur le socle de l'étape 1, ET implémenter la
décision produit D1 (automode) une fois tranchée.

## Contexte

**Ne pas commencer le code de cette étape avant que D1 soit tranchée**
(`00-INDEX.md`, Angles à clarifier). PDJ n'a pas de `LockBadge` (le `badge`
actuel du `PageHeader` est un segmented control vue service/financier, pas un
statut clôturé/ouvert — à NE PAS confondre avec le badge de statut de Rapro).
`badgeAlignBreakpoint` de PDJ est actuellement au défaut (`'lg'`), déjà
différent de Rapro (`'none'`) — vérifier intentionnellement si ce choix reste
correct pour PDJ plutôt que de l'aligner aveuglément sur Rapro (le segmented
control n'a pas la même fonction qu'un badge de statut).

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx`
- `src/lib/pdj/automode.ts` et/ou `src/components/shared/useKeySequence.ts` (SI D1 = ajouter un déclencheur tactile)

## Travail à réaliser

### 1. Câblage responsive standard

Même recette que l'étape 2 (RepJour) : `useResponsiveShell`, gating
`title`/`actions` du `PageHeader`, barre basse tactile pour Vue analytique /
Import CSV (si `canManualImport`) / Impression, pager Préc./Suiv. jour.
Le bouton "Externe" (texte, pas icône) : à transposer en `ToolbarCell` avec
une icône adaptée (ex. `Users` ou `UserPlus`), ou omis de la barre basse et
laissé accessible uniquement en mode souris — trancher selon l'usage réel
(à quelle fréquence ce bouton est-il utilisé en contexte mobile ?).

### 2. Décision D1 — automode

Selon l'arbitrage retenu :
- **Option (a)** : ajouter un déclencheur tactile équivalent. Piste : un
  appui long (500ms, même seuil que le long-press de Rapro) sur un élément
  neutre de la page (ex. le titre, ou une cellule dédiée de la barre basse),
  ou une entrée de menu discrète réservée aux rôles autorisés. Le geste choisi
  doit rester DÉCOUVRABLE d'une façon ou d'une autre (l'automode clavier
  actuel n'est documenté nulle part dans l'UI non plus — cohérence à
  respecter, pas à améliorer au-delà de ce qui est demandé).
- **Option (b)** : ne rien ajouter, documenter en commentaire dans
  `BreakfastBoard.tsx` que l'automode reste volontairement réservé au clavier
  physique (poste de bureau), inaccessible en usage tactile pur.

## Ordre d'exécution

1. Câblage responsive standard (§1).
2. Automode (§2), selon l'option retenue.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `npx pnpm build`.
- Vérification manuelle desktop (inchangé) + tactile (barre basse, cellules
  choisies) + si option (a) retenue, le nouveau déclencheur tactile de
  l'automode fonctionne et ne se déclenche pas accidentellement lors d'un
  usage normal de la page.
