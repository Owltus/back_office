# Plan — PDJ : montants HT à partir de l'Addon Production

## Contexte

La page PDJ importe aujourd'hui un seul CSV StayNTouch (« In-House Guests ») qui liste les
réservations présentes au petit-déjeuner. Le PDF imprimé porte déjà trois cases
« PDJ Inclus € / PDJ Extra € / Total € » — mais **vides**, remplies au stylo
(`src/components/pdj/BreakfastBoard.tsx:606-614`).

L'objectif de ce chantier est de **remplir ces trois montants automatiquement, en HT**, en
croisant deux exports StayNTouch :

- **In-House Guests** (déjà ingéré) : une ligne par réservation → sert à compter les
  **couverts** par code petit-déjeuner (Adults + Children).
- **Addon Production** (NOUVEAU) : une ligne par code add-on avec `Total Count`
  (réservations) et `Total Revenue` (TTC) → source des **revenus** petit-déjeuner.

Tous les montants des CSV sont TTC (TVA 10 %) ; la sortie attendue est **HT**. Le nouveau
CSV doit entrer par le **même pipeline email** que le In-House (Worker Cloudflare →
Edge `import-report`, détection du type, écriture en base) ET pouvoir être **importé
manuellement** dans la page PDJ, comme le In-House. Pour l'instant : **aucune card à
l'écran** ; le seul rendu visible est dans le PDF (PDJ Inclus toujours affiché, centré ;
PDJ Extra uniquement s'il y a des extras, sinon valeur vide).

Contraintes du projet reprises : backend Supabase de PRODUCTION, **SQL exécuté par
l'utilisateur** (l'assistant propose les scripts `supabase/*.sql`) ; scripts idempotents et
non destructifs ; RLS « par page » comme autorité unique (`page_permissions_rls*.sql`) ;
`import-report` se redéploie **toujours** avec `--no-verify-jwt` (ou `config.toml` figé) ;
conventions métier (`named exports`, simple quotes, pas de `;`, alias `#/…` avec extension).

## Décisions actées (validées le 2026-08-10)

- **A — Source des extras : dérivée du décompte existant (A1).**
  `extras = Σ max(0, breakfasts_served − breakfasts_included)` sur les chambres du jour.
  L'utilisateur confirme le mécanisme déjà en place : case « attendue » (bordure pleine /
  gras) = client avec PDJ inclus ; case cochée **non attendue** (ou chambre sans PDJ inclus)
  = extra. Aucun nouvel input, aucune table `pdj_day_extras`, aucune card. C'est déjà la
  définition analytique (`src/lib/pdj/analytics.ts:108`).

- **B — Contrôle : avertissement défensif discret (B1).** `includedTTC = Σ revenue des codes
  petit-déjeuner` est la **vérité**. On n'ajoute que des avertissements non bloquants : un code
  a du revenu mais 0 couvert In-House (prix impossible), des extras sont demandés sans prix PDJ
  calculable, ou l'écart réservations In-House ↔ `Total Count` Addon est marqué. Pas de
  comparaison à « Date Range » (total tous add-ons confondus, non fiable). Rester léger.

- **C — Date métier : lue dans le contenu, PUIS alignée sur le jour du board (+1 jour).**
  POINT DE CORRECTION N°1 (voir ci-dessous).

- **D — « PDJ Extra € » sans extra : case gardée, valeur vide (D1).** Grille à 3 colonnes
  intacte, libellé pré-imprimé conservé.

- **E — Montants recalculés à la volée (E1).** On ne stocke que le brut (`revenue_ttc`) ;
  les 3 montants HT sont recalculés à l'affichage (comme l'analytique).

- **F — Clé mono-hôtel.** `(service_date, code)` sans `hotel_code`. Vigilance si multi-hôtel un jour.

## Point de correction n°1 — alignement des dates (à VÉRIFIER sur une paire réelle)

Les deux fichiers d'un même cycle décrivent **le même petit-déjeuner** mais ne portent pas la
même date :

- In-House `..._20260810030258.csv` → rangé sous `service_date = 2026-08-10` (convention
  actuelle : date du nom de fichier). C'est le matin où le petit-déjeuner est servi.
- Addon `..._20260810120502.csv` → date métier **dans le contenu** = `2026-08-09` (« hier »,
  généré après la clôture de nuit).

Donc **date métier Addon (contenu) + 1 jour = jour du board = `service_date` In-House**. Le
plan **stocke l'Addon sous le jour du petit-déjeuner** (`businessDate + 1`), pour qu'un jour
affiché retrouve à la fois ses lignes In-House et ses revenus Addon avec la même clé. La date
brute du fichier reste tracée via `source_file`. **À confirmer sur une vraie paire de fichiers
à l'Étape 6** (c'est l'hypothèse qui fait ou casse tout le calcul).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-addon-production.md](./1-sql-addon-production.md) | SQL : table `pdj_addon_production` + RLS (autorité) + trigger | — | P0 | 1h | `supabase/pdj_addon_production.sql` + policy SELECT (exécutés par l'utilisateur) | ⚠ |
| 2 | [2-metier-parseur-calcul.md](./2-metier-parseur-calcul.md) | Métier pur : `addon.ts` (parseur) + `amounts.ts` (calcul) + `fmtEur` + tests | — | P0 | 2h | Parsing + `computePdjAmounts` + tests verts | |
| 3 | [3-service-supabase.md](./3-service-supabase.md) | Service : `fetchAddonProduction` + `importAddonProduction` | 1,2 | P0 | 1h | Lecture/écriture `pdj_addon_production` | |
| 4 | [4-edge-ingestion-pipeline.md](./4-edge-ingestion-pipeline.md) | Edge : `import-report/addon.ts` + greffe `detectType`/routage | 1 | P0 | 2h | Ingestion auto Addon (déploiement `--no-verify-jwt`) | |
| 5 | [5-frontend-import-pdf.md](./5-frontend-import-pdf.md) | Frontend : aiguillage import manuel Addon + calcul + injection PDF (3 cases) | 2,3 | P0 | 2h30 | PDF rempli, import manuel Addon, aucune card écran | |
| 6 | [6-validation-globale.md](./6-validation-globale.md) | Validation : tsc + build + tests + contrôle sur CSV réels + RLS/rôles + déploiement | 1,2,3,4,5 | P1 | 1h30 | Build vert + montants vérifiés sur le fichier fourni | ⚠ |

## Ordre d'exécution

Séquentiel avec deux amorces parallèles :

- **Sprint 1 (parallélisable)** : Étape 1 (SQL, exécutée par l'utilisateur) **et** Étape 2
  (métier pur, aucune dépendance) en même temps.
- **Sprint 2** : Étape 3 (service, besoin des noms de table) puis Étape 4 (Edge, besoin de
  la table) — parallélisables entre elles une fois l'Étape 1 jouée.
- **Sprint 3** : Étape 5 (frontend, besoin du métier + service).
- **Sprint 4** : Étape 6 (validation de bout en bout).

Décisions A à F actées le 2026-08-10. Le seul point encore à confirmer est l'**alignement des
dates** (Point de correction n°1), vérifiable seulement sur une vraie paire de fichiers
(Étape 6) — il ne bloque pas l'écriture du code, seulement sa validation finale.

## Architecture cible

```
Pipeline auto (inchangé côté Worker) :
  StayNTouch → Worker Cloudflare → Edge import-report
    detectType('addon') → importAddon() → table pdj_addon_production   [nouveau]

Import manuel (page PDJ) :
  BreakfastBoard.loadFiles → aiguillage par contenu
    ├─ In-House  → mergeCsvFiles → importRows → pdj_breakfasts          [existant]
    └─ Addon     → parseAddonProduction → importAddonProduction → pdj_addon_production  [nouveau]

Rendu PDF (page PDJ, print CSS) :
  computePdjAmounts(addonRows, dayRows, extras)
    → { includedHT, extrasHT, totalHT }
    → cases .pdj-revenue-value (lignes 606-614)                        [remplies]
```

```
src/lib/pdj/
├── addon.ts        ← parseAddonProduction, isBreakfastCode                 [nouveau]
├── amounts.ts      ← countCovers, computePdjAmounts (fromTTC/VAT_FACTOR)   [nouveau]
├── addon.test.ts   ← tests parseur                                         [nouveau]
├── amounts.test.ts ← tests calcul (dont division par zéro)                 [nouveau]
├── service.ts      ← + PDJ_ADDON_TABLE, fetch/importAddonProduction        [modifié]
└── format.ts       ← + fmtEur au réexport                                  [modifié]

src/components/pdj/BreakfastBoard.tsx  ← aiguillage import + calcul + injection  [modifié]
src/styles/pdj.css                     ← ajustement seulement si option D2        [modifié?]

supabase/functions/import-report/
├── addon.ts   ← importAddon (Deno, miroir du parseur)                      [nouveau]
└── index.ts   ← type 'addon' + detectType + routage                       [modifié]

supabase/
├── pdj_addon_production.sql            ← table + index + trigger + enable RLS  [nouveau]
├── page_permissions_rls_lectures.sql  ← + policy SELECT pdj_addon_production   [modifié]
├── page_permissions_rls.sql           ← + policies INSERT/UPDATE/DELETE        [modifié]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | `page_permissions_rls_lectures.sql`, `page_permissions_rls.sql` | `pdj_addon_production.sql` |
| Métier | `src/lib/pdj/service.ts`, `src/lib/pdj/format.ts` | `src/lib/pdj/addon.ts`, `amounts.ts`, `addon.test.ts`, `amounts.test.ts` |
| Edge | `supabase/functions/import-report/index.ts` | `supabase/functions/import-report/addon.ts` |
| Frontend | `src/components/pdj/BreakfastBoard.tsx` | — |
| **Total** | **6 modifiés** | **6 nouveaux** |

> Périmètre = décisions actées **A1, B1, C(+1j), D1, E1, F**. Pas de table `pdj_day_extras`,
> pas de nouvel input, pas de card : l'unique rendu visible est dans le PDF.
