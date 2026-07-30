# Plan — Consolidation du socle analytique (5 features)

## Contexte

Les 5 paires de pages analytique (repjour, pdj, parking, rapro, caisse) — une vue
PARENT annuelle + une vue ENFANT journalière/mensuelle chacune — partagent déjà un
socle de composants dans `src/components/analytique/**` (AnalytiqueShell, Cards, Table,
Charts, KpiCell, KpiLineChart, KpiStackedBarChart, YearNav, AnalytiqueBackButton,
Skeleton). L'utilisateur est attaché aux composants réutilisables pour la maintenance et
veut s'assurer que tout est bien géré, avec un soin particulier sur le DÉTAIL des
tooltips. Les types de graphiques diffèrent selon les pages (lignes, empilé) : cette
diversité est VOULUE et reste inchangée.

Un audit en 5 agents parallèles (socle, repjour+pdj, parking+caisse, rapro, routes+données)
a confirmé que la couche présentation est bien mutualisée, mais a relevé :

- **Asymétrie de tooltips** : `KpiStackedBarChart` a une infobulle personnalisée riche
  (pastille + nom + valeur alignée + en-tête via `labelFormatter`) ; `KpiLineChart` utilise
  l'infobulle Recharts PAR DÉFAUT, sans `labelFormatter` → en-tête = valeur brute de l'axe
  (« Fév », « 15 ») au lieu de « Février 2026 » / « Mardi 15 février ». C'est le point le
  plus visible pour l'utilisateur.
- **Cartes sans explication** : parking et rapro (analytique) n'ont aucun `hint` alors que
  pdj et caisse en ont ; `StatTile` le supporte.
- **Duplication** : `MONTHS_SHORT` recopié dans 3 boards ; helpers de format (`fmtInt`,
  `fmtPct`, `fmtEur`) réécrits dans 4 modules avec des rendus divergents ; `useEffect` de
  recalage d'année dupliqué dans 4 parents ; cellules/lignes de tableau réécrites à la main
  (repjour et parking n'ont pas de fichier `*Parts.tsx`, contrairement à pdj, caisse, rapro).
- **Bugs** : double année dans le titre PDF parking mensuel ; parking mensuel affiche des
  zéros au lieu de tirets pour un jour vide ; repjour parent réimplémente `KpiCell` à la
  main ; PDJ enfant retombe sur 0 au lieu de « — » ; couleurs `#818cf8`/`#94a3b8` en dur
  alors que ce sont `var(--chart-1)`/`var(--muted-foreground)`.
- **Incohérences** : légende écran sur les line charts mono-série (redondante) ; formats %
  (avec/sans espace) ; libellés de cartes parent vs enfant ; validation des params de route
  absente côté analytique (`Number(year)` → NaN possible).

## Angles à clarifier

Décisions à trancher avant/pendant l'exécution (mes recommandations en tête) :

- **Portée du chantier.** Recommandation : faire la consolidation CIBLÉE (socle tooltip +
  hints + constantes/formats partagés + hook d'année + corrections de bugs + factorisations
  légères) et LAISSER pour une phase ultérieure optionnelle la refonte profonde de la couche
  DONNÉES (hooks `useAnnualAnalytics`/`useMonthlyDetail` unifiant les 3 stratégies de fetch,
  fichiers `Parts` pour repjour et parking). Cette dernière est plus risquée (touche le
  fetch par feature) et mérite son propre chantier.
- **Légende écran des graphiques en lignes mono-série** (parking, caisse). Recommandation :
  la masquer quand il n'y a qu'une série (redondante avec le titre), la garder quand il y en
  a plusieurs (repjour). À confirmer.
- **Navigation depuis repjour mois.** C'est la seule vue enfant SANS clic vers le jour (les
  4 autres naviguent vers `/<feature>?date=`). Recommandation : hors périmètre ici (le board
  repjour gère sa date en interne, lui ajouter `?date=` est un chantier séparé) — à confirmer.
- **Unification des formats** (% avec espace, euro décimales). Recommandation : centraliser
  dans un `lib/format` commun et aligner sur une convention unique. À confirmer.
- **Déplacement des constantes de date** (MONTHS, MONTHS_SHORT, DAY_NAMES) hors de
  `repjour/constants.ts` vers `lib/shared`. Recommandation : déplacer AVEC ré-export depuis
  l'ancien emplacement pour ne casser aucun import existant.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-socle-tooltip-primitives.md](./1-socle-tooltip-primitives.md) | Socle : tooltip unifié + primitives cohérentes | — | P0 | 2 h | `ChartTooltip` partagé + `labelFormatter` sur les 2 graphes | ⚠ |
| 2 | [2-constantes-formats-partages.md](./2-constantes-formats-partages.md) | Constantes de date + helpers de format partagés | 1 | P1 | 2 h | `lib/shared/dates` + `lib/format` communs, doublons retirés | ⚠ |
| 3 | [3-hook-annee-navigation.md](./3-hook-annee-navigation.md) | Hook d'année partagé | 2 | P1 | 1 h | `useAnnualYear` remplaçant les 4 `useEffect` dupliqués | |
| 4 | [4-tooltips-hints-details.md](./4-tooltips-hints-details.md) | Tooltips détaillés + hints des cartes | 1,2 | P1 | 1 h 30 | En-têtes d'infobulle riches partout + hints cohérents | |
| 5 | [5-corrections-coherence.md](./5-corrections-coherence.md) | Corrections de bugs + cohérence | 1,2,3 | P0 | 2 h | Bugs corrigés, tokens de couleur, cohérence parent/enfant | ⚠ |
| 6 | [6-validation-globale.md](./6-validation-globale.md) | Validation globale | 1,2,3,4,5 | P0 | 40 min | tsc + build + tests + revue navigateur | ⚠ |

## Ordre d'exécution

Séquentiel : 1 → 2 → 3 → 4 → 5 → 6. L'étape 1 (socle) débloque les tooltips de l'étape 4 ;
l'étape 2 (constantes/formats) doit précéder les boards qui les consomment (3, 4, 5). Les
étapes 4 et 5 pourraient partiellement se paralléliser mais on garde l'ordre pour une revue
cohérente.

## Architecture cible

```
src/components/analytique/           (socle — enrichi, pas refondu)
├── ChartTooltip.tsx        (NOUVEAU : infobulle commune bar + line)
├── chartConstants.ts       (NOUVEAU : hauteur, marge, couleurs axes/grille)
├── useAnnualYear.ts        (NOUVEAU : state année + liste + clamp)
├── KpiLineChart.tsx        (tooltip custom + labelFormatter)
├── KpiStackedBarChart.tsx  (réutilise ChartTooltip + chartConstants, stackId param)
├── AnalytiqueCards.tsx     (StatCard relaie printHidden/className)
└── AnalytiqueSkeleton.tsx  (classes de grille partagées avec Cards/Charts)

src/lib/shared/
├── dates.ts                (NOUVEAU : MONTHS, MONTHS_SHORT, DAY_NAMES… — ré-exportés par repjour/constants)
└── (searchParams.ts existant)

src/lib/format/
└── index.ts                (NOUVEAU : fmtInt/fmtPct/fmtEur de base ; chaque feature spécialise)

Les 10 boards consomment le socle enrichi ; couche DONNÉES inchangée (hors périmètre).
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Socle analytique | `KpiLineChart.tsx`, `KpiStackedBarChart.tsx`, `AnalytiqueCards.tsx`, `AnalytiqueSkeleton.tsx` | `ChartTooltip.tsx`, `chartConstants.ts`, `useAnnualYear.ts` |
| Partagé | `lib/repjour/constants.ts` (ré-export) | `lib/shared/dates.ts`, `lib/format/index.ts` |
| Format feature | `lib/{repjour,pdj,parking,caisse}/format.ts` | — |
| Boards repjour | `boards/AnalytiqueBoard.tsx`, `boards/AnalytiqueMoisBoard.tsx` | — |
| Boards pdj | `PdjAnalytiqueBoard.tsx`, `PdjAnalytiqueMoisBoard.tsx`, `PdjAnalytiqueParts.tsx` | — |
| Boards parking | `ParkingAnalytiqueBoard.tsx`, `ParkingAnalytiqueMoisBoard.tsx` | — |
| Boards caisse | `CaisseAnalytiqueBoard.tsx`, `CaisseAnalytiqueMoisBoard.tsx`, `CaisseAnalytiqueParts.tsx` | — |
| Boards rapro | `RaproAnalytiqueBoard.tsx`, `RaproMonthlyBoard.tsx`, `RaproCatColumns.tsx`, `lib/rapro/constants.ts` | — |
| **Total** | **~24 modifiés** | **5 nouveaux** |
