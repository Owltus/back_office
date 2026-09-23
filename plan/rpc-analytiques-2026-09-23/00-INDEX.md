# Plan — Analytiques : une lecture par page au lieu de huit

## Contexte

Le 2026-09-23, le tableau de bord `/repjour` est passé de huit lectures à une
seule RPC (`public.repjour_dashboard(date)`, commit `e83e354`) : **13,798 ms
d'exécution, 17 716 octets**, équivalence prouvée champ par champ sur 189 dates
avec 0 écart. La demande est d'appliquer le même traitement aux pages
analytiques.

Ce que la reconnaissance a établi, et qui **corrige en partie la demande** :

| page | requêtes | vagues | verdict |
|---|---|---|---|
| analytique RepJour annuelle | 4 | 2 (cascade) | à traiter |
| analytique RepJour mensuelle | 4 | 1 | à traiter |
| analytique PDJ annuelle | 4 | 2 (cascade) | à traiter |
| analytique PDJ mensuelle | 4 | 1 | à traiter |
| analytique caisse annuelle | 2 | 1 | marginal |
| analytique caisse mensuelle | 2 | 1 | marginal |
| analytique parking annuelle | **1** | 1 | rien à gagner |
| analytique parking mensuelle | **2** | 1 | rien à gagner |
| analytique rapro annuelle | **2** | 1 | rien à gagner |
| analytique rapro mensuelle | **2** | 1 | rien à gagner |

**Quatre pages sur dix justifient une RPC.** Les analytiques parking et rapro
sont déjà sobres : y appliquer le même chantier coûterait le prix d'une RPC pour
économiser un aller-retour. Elles sont donc hors périmètre, à une exception près
(le bornage de `parking_arrivals_agg`, étape 6).

Le vrai gisement n'est d'ailleurs pas là où on l'attendait. La reconnaissance a
trouvé **six défauts préexistants** qui coûtent aujourd'hui plus cher que les
allers-retours qu'on veut supprimer — quatre divergences de cache qui
**périment activement** le travail d'optimisation déjà fait, une invalidation
qui rate sa cible, et une cascade qui se supprime sans une ligne de SQL. Ils
sont traités en premier (étapes 2 et 3), parce qu'ils ne demandent aucune
décision et qu'ils sont réversibles d'un `git revert`.

Ce qui est **hors de cause, vérifié, et à ne pas toucher** : le canal Realtime
sur `parking_reservations` (seul survivant de la réduction du 2026-09-20) ; la
RPC `rapro_occupancy`, `SECURITY DEFINER` **délibérément** pour qu'un compte
rapro sans droit PDJ voie l'occupation sans PII ; les vues
`parking_daily_occupation` et `rapro_daily_agg`, déjà bornées par date chez
tous leurs lecteurs ; l'algorithme `carryOver` (à état, couvert par une suite
*property-based*) qui doit rester en TypeScript.

## Remise en question (à défaut de `/rodin`)

- **Est-ce le bon chantier maintenant ?** En partie seulement. Le préchauffage
  de la base (commit `1f64e2c`, **non déployé** à ce jour) vaut à lui seul
  −1,2 s sur la première ouverture de **chaque** page. Tant qu'il n'est pas
  actif, chaque mesure oscille entre 2 s et 8 s et aucune amélioration n'est
  démontrable. L'étape 1 est donc bloquante, et elle dépend d'une action
  utilisateur, pas d'une ligne de code.
- **Alternative moins coûteuse ?** Oui, et elle est prioritaire : les étapes 2
  et 3 ne créent aucune RPC, ne demandent aucun arbitrage, et suppriment un
  aller-retour en cascade plus quatre régressions de cache actives. Si le
  chantier devait s'arrêter après l'étape 3, il aurait déjà rapporté.
- **Angle mort.** Une RPC unique fait perdre la **dégradation partielle**.
  Aujourd'hui, si la lecture des tarifs PDJ échoue, seules les colonnes CA
  passent à `—` et la page reste lisible. Demain, c'est toute la page qui tombe.
  Personne ne l'a demandé, et ça ne se voit qu'en panne. Voir D5.
- **Angle mort n° 2.** Aucun test n'existe sur `fetchYearAnalytics`,
  `fetchUnifiedDays` ni sur les huit boards analytiques. Contrairement au
  tableau de bord, il n'y a **aucun filet TypeScript** : l'équivalence devra
  être prouvée par confrontation SQL↔TS sur données réelles, année par année.

## Divergences entre agents (non tranchées)

- **Périmètre.** L'agent PDJ/caisse a chiffré un gisement réel sur ses quatre
  pages ; l'agent parking/rapro conclut que ses quatre pages « n'ont rien à
  gagner ». Les deux ont raison sur leur couche — c'est la demande initiale
  (« pareil pour les autres pages ») qui supposait une symétrie qui n'existe
  pas. Arbitrage retenu dans ce plan : parking et rapro hors périmètre. **À
  confirmer par l'utilisateur.**
- **`to_jsonb(row)` sur une table à PII.** L'agent conventions signale que
  `repjour_dashboard` emploie `to_jsonb(d)`, équivalent fonctionnel d'un
  `select *`, alors que `CLAUDE.md:171` l'interdit sur une table à PII. Il juge
  le précédent acceptable parce que `daily_reports` ne porte pas de PII
  nominative — mais l'analytique PDJ touche `pdj_breakfasts.guest_name`. Aucune
  règle écrite ne tranche ce cas pour les RPC. Voir D6.
- **Preuve d'équivalence.** Le même agent relève que `repjour_dashboard` n'a
  **pas** de `verif_*.sql` commité, alors que le projet a une famille
  `verif_advisor` / `verif_perf` / `verif_complet` et que
  `12-sql-vues-analytiques.md:172` exige « requête de comparaison à l'appui,
  pas à l'œil ». La preuve a été jouée en session et consignée dans le message
  de commit. Reproduire ce précédent ou le corriger ? Voir D7.

## Angles à clarifier

**D1 — Les bornes « mois en cours » doivent-elles rester côté client ?**
Les cartes des analytiques excluent le futur via `new Date()` **du navigateur**
(`AnalytiqueBoard.tsx:91-98`, `AnalytiqueMoisBoard.tsx:81-86`,
`RaproAnalytiqueBoard.tsx:113-114`). Une RPC les calculerait en heure serveur.
*Option A (recommandée)* — la RPC reçoit la date du client en paramètre, comme
`repjour_dashboard(p_date)` le fait déjà. Une seule horloge, celle de
l'utilisateur, et le comportement ne change pas d'un pixel.
*Option B* — la RPC utilise `current_date`. Plus simple, mais divergence autour
de minuit et dépendance au fuseau de l'instance.

**D2 — Les prix de la carte PDJ : avec ou sans date de référence ?**
`cardPrices(rows, tarifs, asOf)` accepte une date de valorisation. Le board PDJ
la passe (`BreakfastBoard.tsx:511`), **les deux pages analytiques ne la passent
pas**. Sur un historique traversant un changement de tarif, board et analytique
n'affichent donc pas les mêmes montants. Je ne sais pas si c'est voulu.
*Option A* — figer le comportement actuel (divergence conservée).
*Option B (recommandée)* — aligner l'analytique sur le board avant d'écrire la
RPC, comme correctif séparé et mesurable.
⚠ **Écartée d'avance** : trancher ce point *dans* la RPC. Figer un comportement
douteux dans du SQL serait pire que de le laisser en TypeScript.

**D3 — Le drapeau de surcapacité croise réalisé et prévisionnel : voulu ?**
`overcapByMonth` (`daily.ts:366,384`) est alimenté par les rapports
(`rj_nuitees > 80`) **et** par les prévisions (`occ > 80`), indépendamment de la
source retenue pour le mois. Un mois « réalisé » peut donc être signalé en
surcapacité à cause d'une ligne de prévision. Seule la branche « vide » force
`false`.
*Option A* — reproduire tel quel (comportement inchangé).
*Option B* — ne regarder que la source gagnante. Plus propre, **mais change
l'affichage** de mois passés.

**D4 — Que faire des clés de cache partagées hors analytique ?**
`['pdj','addon-all']` est consommée par 4 écrans (board PDJ, bande RepJour, les
2 analytiques PDJ) ; `['pdj','analytics','all-history']` par 2 ;
`['pdj','dates']` l'est aussi par `RaproBoard.tsx:157` ;
`['caisse','cautions']` par `CaisseBoard.tsx:374` ; `['rapro','day', date]` par
le board de saisie qui y fait du `setQueryData` optimiste.
*Option A (recommandée)* — la RPC analytique n'absorbe **que** les clés qui lui
sont propres ; les clés partagées restent telles quelles, corrigées par
l'étape 2. Aucune double source de vérité.
*Option B* — une RPC « prix de la carte » séparée, consommée par les trois
pages. Plus élégant, plus cher, et touche le board PDJ hors périmètre.
⚠ **Écartée d'avance** : absorber la clé dans la RPC analytique en laissant les
autres pages sur l'ancien chemin. Deux sources de vérité sur le prix du PDJ,
c'est exactement ce que `pricing.ts` a cherché à éviter après l'incident du
2026-09-12.

**D5 — Accepte-t-on de perdre la dégradation partielle ?**
Aujourd'hui, chaque requête tombe indépendamment. Avec une RPC unique, une
erreur fait tomber la page entière.
*Option A (recommandée)* — accepter. Le `retry` (3 tentatives en panne) et le
bandeau de panne couvrent le cas, et une page à moitié fausse est plus
dangereuse qu'une page absente.
*Option B* — deux RPC par page (le socle, puis les compléments), pour garder
une dégradation par blocs. Double le travail.

**D6 — `to_jsonb(row)` ou colonnes explicites pour l'analytique PDJ ?**
`pdj_breakfasts` porte `guest_name`, `company`, `channel`. `CLAUDE.md:171`
interdit le `select *` sur une table à PII.
*Option A (recommandée)* — `jsonb_build_object` colonne à colonne dès qu'une
RPC touche une table à PII, `to_jsonb` autorisé ailleurs. Écrire la règle dans
`CLAUDE.md` (étape 7).
*Option B* — `to_jsonb` partout, par cohérence avec `repjour_dashboard`.

**D7 — Commite-t-on un script de vérification ?**
*Option A (recommandée)* — un `supabase/verif_rpc_analytiques_2026-09-XX.sql`
en lecture seule, rejouable, qui confronte chaque champ de chaque RPC à sa
requête d'origine. Le projet a déjà cette famille `verif_*` ; quatre RPC sans
filet de test TypeScript la justifient largement.
*Option B* — reproduire le précédent `repjour_dashboard` (preuve jouée en
session, consignée dans le message de commit).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-releve-de-reference.md](./1-releve-de-reference.md) | Relevé de référence après préchauffage | — | P0 | 30 min | `releve-avant.md` chiffré, 5 pages × 3 chargements | |
| 2 | [2-caches-et-invalidations.md](./2-caches-et-invalidations.md) | Divergences de cache et invalidation qui rate sa cible | — | P0 | 1h | 4 `staleTime` alignés, 1 invalidation corrigée | |
| 3 | [3-cascade-rapro.md](./3-cascade-rapro.md) | Suppression de la cascade rapro de la bande | — | P0 | 45 min | 1 requête de moins, 0 cascade, sans SQL | |
| 4 | [4-rpc-analytique-repjour.md](./4-rpc-analytique-repjour.md) | RPC analytique RepJour (annuel + mensuel) | 1, 2 | P1 | 3h | 8 lectures → 2 | ⚠ |
| 5 | [5-rpc-analytique-pdj.md](./5-rpc-analytique-pdj.md) | RPC analytique PDJ (annuel + mensuel) | 1, 2, 4 | P1 | 3h | 8 lectures → 2 (hors clés partagées) | ⚠ |
| 6 | [6-bornage-parking-arrivals.md](./6-bornage-parking-arrivals.md) | Bornage de `parking_arrivals_agg` | 1 | P2 | 45 min | 2 lectures non bornées supprimées | ⚠ |
| 7 | [7-doctrine-et-releve-apres.md](./7-doctrine-et-releve-apres.md) | Doctrine à jour et relevé d'après | 1-6 | P1 | 1h | `releve-apres.md`, `CLAUDE.md` corrigé | ⚠ |

## Ordre d'exécution

1. **Sprint 0 — débloquer la mesure.** L'étape 1 seule. Elle dépend du
   déploiement du Worker de préchauffage, qui est une **action utilisateur**
   (poser `SUPABASE_PUBLISHABLE_KEY`, `wrangler deploy`, `triggers deploy`,
   puis constater un déclenchement réel dans `wrangler tail`). Sans elle, aucune
   des étapes suivantes n'est démontrable.
2. **Sprint 1 — les gains sans décision.** Étapes 2 et 3, parallélisables. Ni
   SQL, ni arbitrage, ni nouvelle surface : quatre régressions de cache
   refermées, une invalidation réparée, une cascade supprimée. C'est le
   meilleur rapport gain/risque du chantier.
3. **Sprint 2 — les RPC.** Étape 4 d'abord (RepJour, le terrain déjà connu et
   celui dont le patron est frais), puis 5 (PDJ, plus subtile : arrondis au
   centime, prix de carte, clés partagées). L'étape 6 peut se glisser en
   parallèle, elle ne touche que parking.
4. **Sprint 3 — clôture.** Étape 7 : relevé d'après comparé au relevé d'avant
   sur les mêmes pages et le même protocole, puis mise à jour de la doctrine.

## Architecture cible

```
supabase/
  repjour_analytique_rpc_2026-09-XX.sql       [nouveau]  2 fonctions (annuel, mensuel)
  pdj_analytique_rpc_2026-09-XX.sql           [nouveau]  2 fonctions (annuel, mensuel)
  parking_arrivals_bornage_2026-09-XX.sql     [nouveau]  fonction bornée par plage
  verif_rpc_analytiques_2026-09-XX.sql        [nouveau]  confrontation SQL↔TS (si D7-A)

src/lib/repjour/services/daily.ts             [modifié]  + 2 fetch, anciens CONSERVÉS
src/lib/pdj/service.ts                        [modifié]  + 2 fetch, anciens CONSERVÉS
src/lib/parking/service.ts                    [modifié]  fetchParkingArrivals borné
src/components/repjour/boards/AnalytiqueBoard.tsx        [modifié]  4 useQuery → 1
src/components/repjour/boards/AnalytiqueMoisBoard.tsx    [modifié]  4 useQuery → 1
src/components/pdj/PdjAnalytiqueBoard.tsx                [modifié]  4 useQuery → 2
src/components/pdj/PdjAnalytiqueMoisBoard.tsx            [modifié]  4 useQuery → 2
src/components/parking/ParkingAnalytiqueBoard.tsx        [modifié]  lecture bornée
src/components/parking/ParkingAnalytiqueMoisBoard.tsx    [modifié]  lecture bornée
src/components/caisse/CaisseAnalytiqueBoard.tsx          [modifié]  staleTime aligné
src/components/caisse/CaisseAnalytiqueMoisBoard.tsx      [modifié]  staleTime aligné
src/components/repjour/DayCrossSummary.tsx               [modifié]  cascade supprimée
src/components/rapro/RaproBoard.tsx                      [modifié]  invalidation corrigée
CLAUDE.md                                                [modifié]  doctrine à jour

plan/rpc-analytiques-2026-09-23/
  releve-avant.md                             [nouveau]
  releve-apres.md                             [nouveau]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| SQL Supabase | 0 | 4 |
| Services (`src/lib`) | 3 | 0 |
| Composants analytiques | 8 | 0 |
| Composants hors analytique | 2 | 0 |
| Doctrine | 1 | 0 |
| Relevés | 0 | 2 |
| **Total** | **14 modifiés** | **6 nouveaux** |

## Différé (hors chantier, à garder en tête)

- **Analytiques parking et rapro.** 1 à 2 requêtes par page : le coût d'une RPC
  ne serait pas remboursé. Rouvrir si elles grossissent.
- **Écritures budget non invalidantes.** `BudgetContent.tsx:126` (`upsertBudget`)
  et `:147` (`deleteYearBudget`) ne touchent jamais le `QueryClient` : après
  modification d'un budget dans Gestion, les analytiques restent périmées
  jusqu'à 60 s voire 5 min. Bug préexistant, hors périmètre — mais la
  consolidation le déplacera sans le corriger si on n'y pense pas.
- **`pms_daily_metrics`.** 1,5 Mo, la table qui grossit le plus vite
  (74,9 lignes/jour) et que l'application ne lit **jamais**. Question de
  rétention, pas de performance (`plan/audit-requetes-2026-09-23.md`).
- **`fetchAllAddonProduction` et `fetchSheets`.** Boucles de pagination
  séquentielles sur table entière. Une page aujourd'hui, cinq allers-retours en
  série à 5 000 lignes. Traitées indirectement par l'étape 5 côté PDJ ; la
  caisse reste sur l'ancien chemin.
- **Test de propriété instable.** `constants.test.ts` (aller-retour TVA) échoue
  par intermittence selon la graine `fast-check`. Préexistant, sans rapport.
