# Plan — Organisation de l'arborescence et des composants réutilisables

## Contexte

Le projet a grandi feature par feature (parking, PDJ, affichage) et les conventions d'organisation ont divergé : le domaine affiche possède une lib métier pure (`lib/poster/`, le modèle de référence), le domaine PDJ garde son parser CSV (~140 lignes de logique pure) dans le composant `BreakfastBoard.tsx`, et le parking n'a ni lib ni store. Plusieurs motifs d'interface sont copiés-collés entre features : bouton « Imprimer / PDF » (×3), logique `handlePrint` (×2, divergentes), avatar « PL » codé en dur (×3), canvas pointillé (×3), wrapper de page des routes (×7). `styles.css` (879 lignes) concentre 78 % de styles propres à deux features. Enfin, la configuration porte des pièges : alias `@/` déclaré dans `tsconfig.json` mais pas dans `package.json#imports` (typecheck OK, runtime cassé), alias shadcn `hooks` vers un dossier inexistant, `export default` vide dans `root-provider.tsx`.

L'objectif du chantier est de fixer des conventions d'arborescence claires — où va le métier, où vont les composants réutilisables, où vont les styles — et de mettre le code existant en conformité **sans changement de comportement visible** (refactor pur, deux exceptions assumées listées ci-dessous), pour que les prochaines pages (Dashboard, RepJour, Rapro, Caisse) naissent directement au bon endroit.

## Angles à clarifier

Divergences remontées par les agents d'exploration et la synthèse. Chaque point porte une recommandation ; les arbitrages sont à valider avant exécution.

- **D1 — Intégrations tierces** : Supabase vit dans `lib/`, TanStack Query dans `integrations/` — règle incohérente. **Option A (recommandée)** : tout regrouper sous `lib/` (`integrations/tanstack-query/root-provider.tsx` → `lib/query.ts`, suppression du dossier `integrations/`). Option B : déplacer `supabase.ts` vers `integrations/supabase/`. Étape 1.
- **D2 — Contrôles de formulaire génériques** enfermés dans `AffichageBoard.tsx` (`Field`, `DateField`, `TimeField`, `TimeColumn`, `SizeSlider`). **Option A (recommandée)** : nouveau `src/components/form/fields.tsx` (module unique, named exports, conventions maison) — `ui/` reste réservé au code shadcn vendored. Option B : les verser dans `ui/`. Étape 5.
- **D3 — `clamp` et `range`** (utilitaires purs enfouis dans parking et PDJ). **Option A (recommandée)** : les rapatrier dans `lib/utils.ts` à côté de `cn()` — pas de micro-fichiers `math.ts`/`array.ts` à ce stade. Étape 2.
- **D4 — `handlePrint` dupliqué et divergent** (PDJ : `setTimeout(100)` ; affiche : `afterprint` + `setTimeout(1000)`). **Option A (recommandée)** : unifier dans `lib/print.ts` sur la variante affiche (`afterprint`, plus fiable) — micro-changement de comportement assumé côté PDJ. Option B : extraire les deux variantes telles quelles. Étape 2.
- **D5 — `parkingStore`** : le parking perd son état à la navigation (incohérent avec pdj/affiche). **Recommandation : reporter** — créer un store change le comportement visible, hors mandat ; à traiter dans un chantier « données parking » ultérieur. Étape 4 (non-création actée).
- **D6 — `parseDateStr`/`formatDateStr`** (AffichageBoard) recoupent `lib/poster/dateFormatter.ts`. **Option A (recommandée)** : les déplacer dans `dateFormatter.ts` tels quels (ajout de fonctions, aucune fonction existante modifiée). Étape 5.
- **D7 — Duplication de type `PosterProps` ≅ `AfficheState`** et re-mapping manuel `AutoSizes` → `fontSize*`. **Option A (recommandée)** : créer `lib/poster/types.ts` avec un type `PosterContent` canonique (nommage du store : `fontSizeTitle`…) ; `AfficheState` et `PosterProps` en dérivent ; `AutoSizes` renommé en conséquence. Étape 5.
- **D8 — Frontière lib pure vs présentation** (`colorSwatch`, `STATUS` avec classes Tailwind). **Recommandation** : `lib/` reste sans classes Tailwind ; seules les fonctions et constantes métier pures migrent, les mappings de couleurs restent côté composants. Étapes 4 et 5.
- **D9 — Emplacement des CSS extraits de `styles.css`**. **Option A (recommandée)** : `src/styles/pdj.css` et `src/styles/poster.css`, chaînés par `@import` depuis `src/styles.css` (contrainte `components.json` → `css: src/styles.css` préservée). Option B : colocalisation dans `components/<feature>/`. Étape 8.
- **D10 — Alias `@/`** : 0 usage vérifié, piège runtime. **Recommandation : supprimer** de `tsconfig.json`. Étape 1.
- **D11 — Couplage `UserMenu` → `supabase`** : un seul point d'appel (`signOut`). **Recommandation : laisser tel quel** — abstraction prématurée sinon. Aucune étape.
- **D12 — Titres de page par onglet** (aujourd'hui « Back Office » figé partout). **Recommandation : inclure** — changement visible mais amélioration nette, cohérente avec l'objectif « pour le futur ». Étape 7 (seconde exception au refactor pur).
- **D13 — Convention hooks** : alias `components.json` → `#/hooks` vers dossier inexistant. **Recommandation** : acter la convention `src/hooks/` (dossier créé au premier hook, pas de dossier vide) ; alias conservé. Étape 1 (documentation).
- **D14 — Fabrique `createModuleStore` / harmonisation des setters**. **Recommandation : reporter** — abstraction spéculative tant qu'un troisième store n'existe pas (lié à D5). Aucune étape.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-assainissement-config-integrations.md](./1-assainissement-config-integrations.md) | Config et conventions | — | P0 | 30 min | Alias propres, `lib/query.ts`, dossier `integrations/` supprimé |  |
| 2 | [2-utilitaires-partages.md](./2-utilitaires-partages.md) | Utilitaires purs | 1 | P0 | 45 min | `clamp`/`range` dans `lib/utils.ts`, `lib/print.ts` unifié |  |
| 3 | [3-lib-pdj-extraction-csv.md](./3-lib-pdj-extraction-csv.md) | Domaine PDJ | 2 | P0 | 1h | `lib/pdj/csv.ts` (métier CSV pur, testable) |  |
| 4 | [4-lib-parking-extraction-metier.md](./4-lib-parking-extraction-metier.md) | Domaine parking | 2 | P0 | 1h | `lib/parking/` (modèle demi-journées, chevauchements, mock) |  |
| 5 | [5-types-affiche-composants-formulaire.md](./5-types-affiche-composants-formulaire.md) | Domaine affiche | 2 | P0 | 2h | `lib/poster/types.ts`, `components/form/fields.tsx`, AffichageBoard dégraissé | ⚠ |
| 6 | [6-composants-transverses.md](./6-composants-transverses.md) | Composants partagés | 2, 5 | P0 | 1h30 | `components/shared/` : UserAvatar, PrintButton, EmptyCanvas, PageHeader | ⚠ |
| 7 | [7-pagecontainer-routes-titres.md](./7-pagecontainer-routes-titres.md) | Routes | 6 | P1 | 45 min | `PageContainer` adopté par les 7 routes, titres par page | ⚠ |
| 8 | [8-decoupage-styles-css.md](./8-decoupage-styles-css.md) | Styles | 7 | P1 | 1h | `styles.css` réduit aux fondations, `styles/pdj.css` + `styles/poster.css` |  |
| 9 | [9-validation-globale.md](./9-validation-globale.md) | Validation | 1–8 | P0 | 30 min | Typecheck, lint, build, parcours des pages et aperçus print | ⚠ |

## Ordre d'exécution

1. Étape 1 (config) puis étape 2 (utilitaires) — socle des suivantes.
2. Étapes 3, 4 et 5 parallélisables entre elles (fichiers disjoints : PDJ / parking / affiche).
3. Étape 6 après stabilisation des boards (5 notamment), puis étape 7.
4. Étape 8 en avant-dernier (fichiers CSS disjoints du reste, placée ici pour éviter tout conflit d'édition sur les boards).
5. Étape 9 en clôture.

## Architecture cible

```
src/
├── components/
│   ├── Navbar.tsx / Logo.tsx / UserMenu.tsx / ComingSoon.tsx   ← chrome de l'app
│   ├── form/fields.tsx        ← contrôles de formulaire maison (Field, DateField, TimeField, …)
│   ├── shared/                ← réutilisables transverses (UserAvatar, PrintButton,
│   │                            EmptyCanvas, PageHeader, PageContainer)
│   ├── affiche/ parking/ pdj/ ← boards par feature (rendu et interaction uniquement)
│   └── ui/                    ← primitives shadcn vendored (jamais retouchées à la main)
├── hooks/                     ← hooks custom (créé au premier hook — convention D13)
├── lib/
│   ├── utils.ts               ← cn, clamp, range
│   ├── print.ts               ← impression avec titre de document temporaire
│   ├── supabase.ts  query.ts  ← intégrations tierces (règle D1)
│   ├── pdj/  parking/  poster/ ← domaines métier purs (sans React, sans Tailwind)
│   ├── pdjStore.ts  afficheStore.ts ← stores TanStack module-level
├── routes/                    ← wrappers fins : head() + PageContainer + Board (intouchable TanStack)
├── styles/
│   ├── pdj.css  poster.css    ← styles par feature (préfixes .pdj-* / .poster-*)
└── styles.css                 ← tokens, base, utilitaires globaux + @import des feature css
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Config | `tsconfig.json` | — |
| Lib | `utils.ts`, `pdjStore.ts`, `afficheStore.ts`, `poster/dateFormatter.ts`, `poster/sizeCalculator.ts`, `router.tsx` (import) | `query.ts`, `print.ts`, `pdj/csv.ts`, `parking/model.ts`, `parking/mock.ts`, `poster/types.ts` |
| Composants | `Navbar.tsx`, `UserMenu.tsx`, `ComingSoon.tsx`, `affiche/AffichageBoard.tsx`, `affiche/Poster.tsx`, `parking/ParkingBoard.tsx`, `pdj/BreakfastBoard.tsx` | `form/fields.tsx`, `shared/UserAvatar.tsx`, `shared/PrintButton.tsx`, `shared/EmptyCanvas.tsx`, `shared/PageHeader.tsx`, `shared/PageContainer.tsx` |
| Routes | 7 fichiers `src/routes/*.tsx` (`routeTree.gen.ts` régénéré) | — |
| Styles | `styles.css` | `styles/pdj.css`, `styles/poster.css` |
| Supprimés | `src/integrations/` (dossier entier) | — |
| **Total** | **22 modifiés, 1 dossier supprimé** | **14 nouveaux** |
