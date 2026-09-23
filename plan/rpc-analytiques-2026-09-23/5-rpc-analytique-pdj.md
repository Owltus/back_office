# Étape 5 — RPC analytique PDJ (annuel + mensuel)

## Objectif

Ramener les huit lectures des deux pages analytiques PDJ à deux, **sans toucher
aux deux clés partagées avec le board PDJ et la bande RepJour**.

## Contexte

### Vue annuelle — 4 allers-retours en 2 vagues

| clé | lit | réglage |
|---|---|---|
| `['pdj','dates']` | vue `pdj_service_dates`, aucun filtre | `staleTime: 5 min` |
| `['pdj','analytics', year]` | vue `pdj_daily_agg`, année bornée | — |
| `['pdj','addon-all']` | table `pdj_addon_production`, **aucun filtre**, `select('*')` | — ⚠ |
| `['pdj','externals', year]` | `pdj_externals`, année bornée | — |

Cascade : `['pdj','dates']` → `yearsFromDates` → `useAnnualYear` → `year` → les
deux requêtes annuelles. Même recalage que côté RepJour, même risque de seconde
vague jetée.

### Vue mensuelle — 4 allers-retours

Dont deux lectures **non bornées** :
`['pdj','analytics','all-history']` = `fetchDailyAgg('2000-01-01','2100-12-31')`
— des bornes qui ne bornent rien, donc réagrégation de toute
`pdj_breakfasts` (~330 ms à froid selon `BreakfastBoard.tsx:497`) — et
`['pdj','addon-all']`, toute la table de facturation **pour en tirer trois
nombres** (`detectTarifs` rend une `Map` de 3 entrées).

### Le verrou : deux clés partagées hors analytique

| clé | board PDJ | bande RepJour | analytiques |
|---|---|---|---|
| `['pdj','addon-all']` | `BreakfastBoard.tsx:464` | `DayCrossSummary.tsx:189` | annuel + mensuel |
| `['pdj','analytics','all-history']` | `BreakfastBoard.tsx:489` | — | mensuel |
| `['pdj','dates']` | `BreakfastBoard.tsx:255` | — | annuel, **et `RaproBoard.tsx:157`** |

**On ne peut pas les absorber dans une RPC analytique** sans laisser les autres
pages sur l'ancien chemin — c'est-à-dire sans créer deux sources de vérité sur
le prix du PDJ. C'est précisément ce que `pricing.ts` a cherché à éviter après
l'incident du 2026-09-12 (« ne JAMAIS dériver un prix par recette ÷ couverts »).

Décision retenue (D4 option A) : **la RPC n'absorbe que ce qui lui est propre.**
Les clés partagées restent, corrigées par l'étape 2.

## Fichier(s) impacté(s)

- `supabase/pdj_analytique_rpc_2026-09-XX.sql` (nouveau : 2 fonctions)
- `src/lib/pdj/service.ts` (modifié : + 2 `fetch`, anciens CONSERVÉS)
- `src/components/pdj/PdjAnalytiqueBoard.tsx` (modifié : 4 `useQuery` → 2)
- `src/components/pdj/PdjAnalytiqueMoisBoard.tsx` (modifié : 4 → 2)

## Travail à réaliser

### 1. Les cas limites — plus piégeux qu'en RepJour

**`null` n'est jamais `0`.** `extra` et `noShow` valent `null` quand la conso
n'a pas été saisie, et s'affichent `—`. Règle mensuelle
(`analytics.ts:254,262-263`) :
`extra = (served > 0 || extra > 0) ? extra : null`, mais
`noShow = served > 0 ? noShow : null`. **La dissymétrie est voulue** : un jour à
externes seuls a un `extra` non nul et un `noShow` nul.

- `conversion = guests > 0 ? ((included + (extra ?? 0)) / guests) * 100 : null`
  — `extra` coalescé à 0 **dans le numérateur**, mais `conversion` reste `null`
  si `guests = 0`.
- `extra` / `no_show` de la vue sont **déjà** `greatest(...,0)` sommés par
  chambre : on additionne les codes, on ne re-dérive **jamais**
  `max(0, Σserved − Σincluded)`.
- Colonne « Servis » du tableau = `served − extra` ; **carte** « Servis » =
  `totalServed` brut. Deux définitions du même mot dans la même page.
- Occupation mensuelle = **moyenne des taux quotidiens**, pas
  `Σrooms / (80 × jours)`. Équivalent ici, à figer explicitement.
- **Trois dénominateurs différents** dans le résumé : `avgInclus` sur
  `totalDays`, `avgServis`/`avgExtra`/`avgNonServis` sur les jours renseignés,
  `avgCa` sur les jours à CA > 0.

**Le CA se calcule au centime, dans un ordre précis** (`amounts.ts:174-246`) :
`round2(fromTTC(round2(billedTtc)))` si au moins un code du jour porte
`revenue_ttc`, sinon `round2(Σ included × round2(fromTTC(prix_carte)))` ; extras
`= round2(max(0, extra − offert) × round2(fromTTC(prix_fort)))` ; total
`= round2(inclus + extras)`. **Un jour dont le total ≤ 0 est ABSENT de la Map**
→ `—` et exclu du dénominateur. Ce n'est pas `0`.

⚠ Deux `round2` **différents** coexistent dans le projet : celui de PDJ
(`amounts.ts:19`) et celui de caisse (`calc.ts:145`, avec `Number.EPSILON`).
Ne pas les confondre en portant le calcul en SQL.

### 2. Ce qu'il ne faut PAS porter en SQL

- **`cardPrices`** (`pricing.ts:115-172`) : mode du quotient en centimes
  entiers, fenêtre des 21 dernières journées exploitables, minimum 3
  observations, départage des ex æquo en faveur de la position la plus récente.
  Porter ça en SQL est possible mais gratuit en risque : la clé
  `['pdj','addon-all']` reste de toute façon, donc le calcul reste en TS.
- **`detectTarifs`** (`tarif.ts`) : recherche de diviseur avec seuils de
  support. C'est désormais un **repli** ; vérifier s'il est encore atteignable
  en pratique avant même d'envisager de le porter.
- **`computeRuptureThreshold`** (`analytics.ts:360-395`) : recherche du point de
  coupure maximisant l'écart de taux de non-servis (`MIN_SAMPLE 20`,
  `MIN_GROUP 6`, `MIN_GAP 3`). Bon candidat théorique à un pré-calcul SQL, mais
  c'est le morceau le plus subtil de la couche. **Hors périmètre.**

### 3. Le point de non-déterminisme à supprimer

`PdjAnalytiqueMoisBoard.tsx:111-124` :
`cardPrices(historyRows.length > 0 ? historyRows : rows, …)` — la **source
change selon l'ordre d'arrivée des requêtes**. Tant que l'historique n'est pas
là, les prix sont calculés sur le seul mois affiché, puis recalculés quand il
arrive : **le CA affiché peut sauter visiblement**. Une RPC qui livre les deux
ensemble supprime ce saut. C'est un gain d'exactitude perçue, pas seulement de
vitesse — à mentionner dans l'en-tête SQL.

### 4. `to_jsonb` interdit ici

`pdj_breakfasts` porte `guest_name`, `company`, `channel`. Conformément à D6
option A, la RPC construit son `jsonb_build_object` **colonne par colonne**.
Ne pas reprendre le `to_jsonb(d)` de `repjour_dashboard` par mimétisme.

En pratique, les RPC analytiques PDJ lisent les **vues** `pdj_daily_agg` et
`pdj_service_dates`, pas la table : le risque est théorique tant qu'on n'y
touche pas. Le vérifier plutôt que le supposer.

### 5. Le découpage retenu

- `public.pdj_analytique_annuelle(p_annee int, p_aujourdhui date)`
  → `{ annees, mois[12], externes }`
- `public.pdj_analytique_mensuelle(p_annee int, p_mois int, p_aujourdhui date)`
  → `{ jours, externes, seuilRupture? }`

`['pdj','addon-all']` et `['pdj','analytics','all-history']` **restent des
requêtes séparées**, avec leur `staleTime` d'une heure aligné à l'étape 2.
Chaque page passe donc de 4 lectures à 2.

⚠ **Les clés doivent rester sous `['pdj', …]`** : trois
`invalidateQueries({ queryKey: ['pdj'] })` en dépendent
(`PdjAnalytiqueBoard.tsx:242` après import Addon, `BreakfastBoard.tsx:797` après
import CSV, `:1083` après suppression d'un jour).

### 6. Préserver le partage annuel ↔ mensuel

Les deux pages partagent **délibérément** `['pdj','analytics', year]` : la
navigation annuel↔mois est instantanée. Une RPC **par mois** détruirait ce
partage et relancerait une lecture à chaque aller-retour. Garder la granularité
« année » dans la fonction mensuelle, ou conserver une clé commune.

### 7. Discipline d'application

Identique à l'étape 4 : écrire, **commiter avant d'appliquer**, essayer en
`begin … rollback`, appliquer, **prouver l'équivalence avant de toucher au
client**, puis seulement modifier les composants.

## Ordre d'exécution

1. Vérifier que `detectTarifs` est encore atteignable en pratique.
2. Écrire et commiter le SQL, l'essayer en `rollback`, l'appliquer.
3. Prouver l'équivalence année par année et mois par mois, au centime sur le CA.
4. Écrire les deux `fetch` dans `service.ts`.
5. Réécrire les deux boards, en laissant les deux clés partagées intactes.
6. `npx tsc --noEmit` + `npx vitest run` + `pnpm build`.
7. Mesurer selon le protocole de l'étape 1.

## Critère de validation

- Écarts SQL↔TS à **zéro**, **au centime** sur le CA, sur toutes les années et
  tous les mois présents en base — y compris les jours à `extra`/`noShow` `null`
  et les jours à total ≤ 0 (absents, pas à zéro).
- Chaque page passe de 4 lectures à **2**, sans cascade.
- Les clés `['pdj','addon-all']` et `['pdj','analytics','all-history']` sont
  **toujours consommées** par le board PDJ et la bande RepJour, avec leur
  `staleTime` d'une heure.
- Le CA du tableau mensuel ne **saute plus** après le premier affichage.
- Après un import Addon ou CSV, les deux pages se rafraîchissent toujours.

## Contrôle qualité (revue)

Étape critique (fonctions en base, arrondis financiers, clés partagées avec deux
écrans hors périmètre). `/borg` n'étant pas installé, revue manuelle : (1)
confronter le CA de trois mois au centime entre l'ancien et le nouveau chemin,
**à la main**, et non par différence agrégée qui pourrait compenser deux erreurs
de signe opposé ; (2) vérifier que la dissymétrie `extra` / `noShow` est
reproduite en testant un jour à externes seuls ; (3) vérifier `prosecdef`, les
grants et le `search_path` par requête sur `pg_proc` ; (4) ouvrir le board PDJ
puis l'analytique puis le board, et confirmer sur `pg_stat_statements` que
`pdj_addon_production` n'est **pas** relue ; (5) confirmer qu'aucune clé n'est
sortie du préfixe `['pdj', …]`.
