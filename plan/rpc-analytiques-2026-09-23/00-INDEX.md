# Plan — Analytiques : une lecture par page au lieu de huit

> **EXÉCUTÉ PARTIELLEMENT le 2026-09-23** (5 étapes sur 9). Écarts par rapport
> au plan initial, tous adossés à `releve-apres.md` :
> - **étapes 5b, 6 et 8 SANS OBJET** : consolider ne gagne QUE si les requêtes
>   se font concurrence. Les pages analytiques en lancent quatre, parallèles,
>   sous le plafond de six — le temps de page vaut `max(durées)` et non leur
>   somme. Gain mesuré : −41 % sur l'annuelle RepJour, **zéro** sur les trois
>   autres pages.
> - **étape 7 RÉDUITE** : la RPC parking est sans objet, mais le **bornage** de
>   `parking_arrivals_agg` reste valable — seule lecture « tout l'historique »
>   non bornée subsistante, et elle grossit de 365 lignes par an.
> - **le « creux de chargement du code » de `releve-avant.md` N'EXISTE PAS**
>   comme coût structurel : mes quatre mesures avaient toutes été prises juste
>   après un déploiement. Remesuré sur la même page : 802 ms puis **7 ms**.

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
| analytique caisse annuelle | 2 | 1 | gain faible |
| analytique caisse mensuelle | 2 | 1 | gain faible |
| analytique parking annuelle | **1** | 1 | gain faible |
| analytique parking mensuelle | **2** | 1 | gain faible |
| analytique rapro annuelle | **2** | 1 | gain faible |
| analytique rapro mensuelle | **2** | 1 | gain faible |

**Quatre pages sur dix portent l'essentiel du gain** (RepJour et PDJ, 4 lectures
chacune). Les six autres n'en font que 1 à 2 : j'ai proposé de les laisser
hors périmètre, **l'utilisateur a demandé de les traiter quand même, pour
l'uniformité** (décision du 2026-09-23). Elles sont donc dans le chantier, en
priorité P2, après les quatre qui rapportent.

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
- **Le périmètre élargi en vaut-il la peine ?** J'ai argumenté que non pour
  caisse, parking et rapro (1 à 2 lectures par page). L'utilisateur a tranché
  pour l'uniformité. C'est une décision légitime — un code homogène se relit et
  se maintient mieux qu'un code où la moitié des pages suit un patron et l'autre
  non. Le coût est réel (trois RPC de plus, trois preuves d'équivalence de plus,
  plus de surface à tester) et il est assumé, pas ignoré.
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
  pas. **Tranché le 2026-09-23 : l'utilisateur veut les dix pages.** La
  divergence reste consignée parce qu'elle documente un coût assumé, pas une
  erreur d'analyse.
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

## Décisions actées (validées le 2026-09-23)

- **Périmètre** : **les dix pages analytiques sont traitées** (option B de la
  question de périmètre). Caisse, parking et rapro passent en P2, après les
  quatre pages qui portent le gain.
- **Prix de la carte PDJ (D2)** : **chaque jour est valorisé au tarif qui avait
  cours ce jour-là** (option B). L'analytique s'aligne sur le board PDJ, qui
  passe déjà `asOf`. Citation de la décision : « si un jour le prix du petit
  déj est à celui-ci, le jour qui suit c'en est un autre […] tu dois afficher
  les bons prix au bon moment de manière cohérente ». ⚠ Les montants de
  l'analytique PDJ **vont changer** sur toute période antérieure à un
  changement de tarif. C'est voulu : ils étaient faux.
- **Voyant de surcapacité (D3)** : **comportement inchangé**, il s'allume quelle
  que soit la source. Fondement donné par l'utilisateur : l'hôtel compte
  **80 chambres physiques, infranchissables** ; on peut en retirer par statut,
  jamais en ajouter. Toute valeur au-dessus de 80 — réelle **ou prévue** — n'est
  donc pas une surcapacité mais une **donnée fausse**, et mérite le même
  signalement. Le voyant est requalifié : alerte de qualité de données, pas
  alerte de remplissage. Aucun chiffre ne bouge.
- **Panne partielle (D5)** : **une RPC par page, page entière + message
  d'erreur** (option A). Une page à moitié fausse est plus dangereuse qu'une
  page absente.

## Décisions techniques (prises par l'assistant, 2026-09-23)

Ces quatre points n'engagent aucun chiffre affiché ni aucune règle métier :
je les tranche, ils restent réversibles et discutables.

- **D1 — bornes « mois en cours »** : la RPC reçoit **la date du client en
  paramètre** (`p_aujourdhui`), comme `repjour_dashboard(p_date)`. Une seule
  horloge, celle de l'utilisateur. `current_date` côté serveur aurait introduit
  une divergence autour de minuit et une dépendance au fuseau de l'instance.
- **D4 — clés de cache partagées hors analytique** : la RPC **n'absorbe que ce
  qui lui est propre**. `['pdj','addon-all']`, `['pdj','analytics',
  'all-history']`, `['pdj','dates']`, `['caisse','cautions']` et
  `['rapro','day']` restent des lectures séparées, corrigées par l'étape 2.
  Les absorber créerait deux sources de vérité sur le prix du PDJ — exactement
  ce que `pricing.ts` a cherché à éviter après l'incident du 2026-09-12.
- **D6 — `to_jsonb(row)` sur une table à PII** : **interdit**. Dès qu'une RPC
  touche `pdj_breakfasts` (`guest_name`, `company`), `profiles` ou
  `parking_reservations`, le `jsonb_build_object` est construit **colonne par
  colonne**. `to_jsonb` reste autorisé sur les vues d'agrégation et sur
  `daily_reports`, qui ne porte pas de PII nominative. La règle est écrite dans
  `CLAUDE.md` à l'étape 9.
- **D7 — preuve d'équivalence** : **un `supabase/verif_rpc_analytiques_*.sql`
  rejouable est commité**. Cinq RPC sans aucun filet de test TypeScript le
  justifient, et le projet a déjà la famille `verif_*`. C'est une extension du
  précédent `repjour_dashboard`, pas sa reproduction — et c'est délibéré.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-releve-de-reference.md](./1-releve-de-reference.md) | Relevé de référence après préchauffage | — | P0 | 30 min | `releve-avant.md`, 10 pages × 3 chargements | |
| 2 | [2-caches-et-invalidations.md](./2-caches-et-invalidations.md) | Divergences de cache et invalidation qui rate sa cible | — | P0 | 1h | 4 `staleTime` alignés, 1 invalidation corrigée | |
| 3 | [3-cascade-rapro.md](./3-cascade-rapro.md) | Suppression de la cascade rapro de la bande | — | P0 | 45 min | 1 requête de moins, 0 cascade, sans SQL | |
| 4 | [4-rpc-analytique-repjour.md](./4-rpc-analytique-repjour.md) | RPC analytique RepJour (annuel + mensuel) | 1, 2 | P1 | 3h | 8 lectures → 2 | ⚠ |
| 5 | [5-rpc-analytique-pdj.md](./5-rpc-analytique-pdj.md) | RPC analytique PDJ + alignement des prix de carte | 1, 2, 4 | P1 | 4h | 8 lectures → 2, montants corrigés | ⚠ |
| 6 | [6-rpc-analytique-caisse.md](./6-rpc-analytique-caisse.md) | RPC analytique caisse (annuel + mensuel) | 4 | P2 | 2h | 4 lectures → 2 | ⚠ |
| 7 | [7-rpc-analytique-parking.md](./7-rpc-analytique-parking.md) | RPC analytique parking + bornage des arrivées | 4 | P2 | 2h | 3 lectures → 2, 0 lecture non bornée | ⚠ |
| 8 | [8-rpc-analytique-rapro.md](./8-rpc-analytique-rapro.md) | RPC analytique rapro (annuel + mensuel) | 3, 4 | P2 | 2h | 4 lectures → 2 | ⚠ |
| 9 | [9-doctrine-et-releve-apres.md](./9-doctrine-et-releve-apres.md) | Doctrine à jour et relevé d'après | 1-8 | P1 | 1h30 | `releve-apres.md`, `CLAUDE.md` corrigé | ⚠ |

## Ordre d'exécution

1. **Sprint 0 — débloquer la mesure.** L'étape 1 seule. Elle dépend du
   déploiement du Worker de préchauffage, qui est une **action utilisateur**.
   Sans elle, aucune des étapes suivantes n'est démontrable : tout relevé
   oscille aujourd'hui d'un facteur 4 selon l'état thermique de l'instance.
2. **Sprint 1 — les gains sans décision.** Étapes 2 et 3, parallélisables. Ni
   SQL, ni arbitrage, ni nouvelle surface : quatre régressions de cache
   refermées, une invalidation réparée, une cascade supprimée. Meilleur rapport
   gain/risque du chantier.
3. **Sprint 2 — les deux pages qui rapportent.** Étape 4 (RepJour, terrain
   connu, patron frais), puis 5 (PDJ, plus subtile : arrondis au centime, prix
   de carte à aligner, clés partagées à préserver). L'étape 5 est la seule qui
   **change des chiffres affichés** — la prévenir avant de la déployer.
4. **Sprint 3 — l'uniformité.** Étapes 6, 7 et 8, parallélisables entre elles.
   Gain faible et assumé ; l'intérêt est l'homogénéité du code. Si le temps
   manque, ce sprint est le premier à sacrifier sans dommage.
5. **Sprint 4 — clôture.** Étape 9 : relevé d'après selon le protocole
   **exact** de l'étape 1, puis mise à jour de la doctrine.

## Architecture cible

```
supabase/
  repjour_analytique_rpc_2026-09-XX.sql       [nouveau]  2 fonctions
  pdj_analytique_rpc_2026-09-XX.sql           [nouveau]  2 fonctions
  caisse_analytique_rpc_2026-09-XX.sql        [nouveau]  2 fonctions
  parking_analytique_rpc_2026-09-XX.sql       [nouveau]  2 fonctions + bornage
  rapro_analytique_rpc_2026-09-XX.sql         [nouveau]  2 fonctions
  verif_rpc_analytiques_2026-09-XX.sql        [nouveau]  confrontation SQL/TS (D7)

src/lib/repjour/services/daily.ts             [modifié]  + 2 fetch, anciens CONSERVÉS
src/lib/pdj/service.ts                        [modifié]  + 2 fetch, anciens CONSERVÉS
src/lib/pdj/pricing.ts                        [modifié]  asOf propagé (décision D2)
src/lib/caisse/service.ts                     [modifié]  + 2 fetch, anciens CONSERVÉS
src/lib/parking/service.ts                    [modifié]  + 2 fetch, arrivées bornées
src/lib/rapro/monthly.ts                      [modifié]  + 2 fetch, anciens CONSERVÉS

src/components/repjour/boards/AnalytiqueBoard.tsx        [modifié]  4 useQuery -> 1
src/components/repjour/boards/AnalytiqueMoisBoard.tsx    [modifié]  4 -> 1
src/components/pdj/PdjAnalytiqueBoard.tsx                [modifié]  4 -> 2
src/components/pdj/PdjAnalytiqueMoisBoard.tsx            [modifié]  4 -> 2
src/components/caisse/CaisseAnalytiqueBoard.tsx          [modifié]  2 -> 1
src/components/caisse/CaisseAnalytiqueMoisBoard.tsx      [modifié]  2 -> 1
src/components/parking/ParkingAnalytiqueBoard.tsx        [modifié]  1 -> 1 bornée
src/components/parking/ParkingAnalytiqueMoisBoard.tsx    [modifié]  2 -> 1
src/components/rapro/RaproAnalytiqueBoard.tsx            [modifié]  2 -> 1
src/components/rapro/RaproMonthlyBoard.tsx               [modifié]  2 -> 1
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
| SQL Supabase | 0 | 6 |
| Services (`src/lib`) | 6 | 0 |
| Composants analytiques | 10 | 0 |
| Composants hors analytique | 2 | 0 |
| Doctrine | 1 | 0 |
| Relevés | 0 | 2 |
| **Total** | **19 modifiés** | **8 nouveaux** |

## Différé (hors chantier, à garder en tête)

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
