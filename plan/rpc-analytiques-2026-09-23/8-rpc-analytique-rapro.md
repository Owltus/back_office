# Étape 8 — RPC analytique rapro (annuel + mensuel)

## Objectif

Ramener les quatre lectures des deux pages analytiques rapro à deux, en
préservant le partage de cache qui rend la navigation annuel ↔ mois
instantanée.

## Contexte

Gain **faible et assumé** : chaque page ne fait que deux lectures, toutes deux
déjà bornées. L'utilisateur a demandé l'uniformité (décision du 2026-09-23).

| page | clé | lit | réglage |
|---|---|---|---|
| annuelle | `['rapro','oldest']` | `rapro_rooms`, `min(report_date)` | `staleTime: Infinity` |
| annuelle | `['rapro','daily-agg', year]` | vue `rapro_daily_agg`, année bornée | — |
| mensuelle | `['rapro','daily-agg', year]` | **même clé** | — |
| mensuelle | `['rapro','oldest']` | **même clé** | `staleTime: Infinity` |

Les deux pages partagent déjà leurs deux clés : c'est ce qui rend le retour
annuel ↔ mois instantané. **Une RPC par mois détruirait ce partage** et
relancerait une lecture à chaque navigation. Il faut donc garder la granularité
« année » dans la fonction mensuelle, ou conserver une clé commune.

### Ce qui est hors de cause, vérifié

- **`rapro_occupancy` est `SECURITY DEFINER` délibérément**
  (`service.ts:28-35`) : c'est ce qui permet à un compte rapro **sans droit
  PDJ** de voir l'occupation sans PII. Une RPC enveloppante `security invoker`
  qui l'appelle conserve ce comportement ; tout passer en `definer`
  **élargirait la surface**. À ne pas faire.
- **La vue `rapro_daily_agg` est déjà bornée** chez tous ses lecteurs, et son
  `JOIN` sur `rapro_sheets` `status = 'validated'` est la définition même de
  « jour actif ». Elle ne renvoie ni les jours à zéro, ni les brouillons.
- **`carryOver` reste en TypeScript.** Algorithme à état (`resolvedSince`,
  priorité du statut terminal sur le liseré manuel, `carryover.ts:87-114`),
  couvert par une suite *property-based*. Rapatrier les lignes brutes et
  laisser le calcul en TS est le bon découpage.

## Fichier(s) impacté(s)

- `supabase/rapro_analytique_rpc_2026-09-XX.sql` (nouveau : 2 fonctions)
- `src/lib/rapro/monthly.ts` (modifié : + 2 `fetch`, anciens CONSERVÉS)
- `src/components/rapro/RaproAnalytiqueBoard.tsx` (modifié : 2 → 1)
- `src/components/rapro/RaproMonthlyBoard.tsx` (modifié : 2 → 1)

## Travail à réaliser

### 1. Les cas limites à reproduire

- **Deux définitions différentes de « jour actif »**, et elles coïncident
  aujourd'hui par accident :
  - annuel : `activeDays = yearMap.size`, le **nombre d'entrées de la Map** ;
  - mensuel : `activeDays = rows.filter(somme des 4 > 0).length`.
  Elles coïncident parce que la vue ne renvoie **que** des jours porteurs. ⚠ Une
  RPC qui renverrait des jours à zéro **ferait diverger les deux moyennes**.
  C'est le piège principal de cette étape.
- `vendues = nettoyee + bloquee + refus` (`monthly.ts:78`), **`rattrapage`
  exclu** ; `cleaned = nettoyee + rattrapage` (`monthly.ts:85`). `cleaned` peut
  donc **dépasser** `vendues` — c'est voulu (`RaproCatColumns.tsx:151-156`).
- `avgCleanedPerDay = Math.round(cleaned / activeDays)` avec garde
  `activeDays ? … : 0`.
- **`monthlyRows` renvoie toujours N lignes** (trous à zéro),
  `byDay.get(date) ?? emptyCounts()`.
- `fetchRaproDailyAgg` renvoie une **Map vide** si aucune ligne, jamais `null` ;
  mais `data` vaut `undefined` tant que la requête est en vol. Le composant rend
  un mois entier à zéro pendant le chargement (`yearMap ?? new Map()`).
- **Mois futurs** : `isFutureMonth` met `null` (pas 0) dans le graphe et
  applique une opacité réduite au tableau. **Calcul d'horloge client** — passe
  par `p_aujourdhui` (décision D1).
- **Bornes du pager** dérivées de `oldest` par **slice de chaîne**
  (`RaproMonthlyBoard.tsx:87-88`). Un `null` (aucune ligne en base) doit rester
  **distinguable** d'un `undefined` (requête en vol).
- `toRaproDay` : ligne `status = null` → **hors** de `statuses` mais peut porter
  `carried_manual` ; statut inconnu → replié sur `'refus'`
  (`dayRows.ts:27-33, 48-49`). Une RPC qui agrège en SQL doit reproduire ce
  repli, ou renvoyer les lignes brutes.

### 2. Le découpage retenu

- `public.rapro_analytique_annuelle(p_annee int, p_aujourdhui date)`
  → `{ premiereDate, mois[12] }`
- `public.rapro_analytique_mensuelle(p_annee int, p_mois int, p_aujourdhui date)`
  → `{ premiereDate, jours }`

`premiereDate` remplace la lecture `['rapro','oldest']` **dans ces deux pages
seulement**. ⚠ La clé `['rapro','oldest']` reste consommée par
`RaproBoard.tsx:147-151` (bornes de navigation du board de saisie) : elle ne
disparaît pas du projet.

⚠ Les clés doivent rester sous `['rapro', …]`, et l'invalidation corrigée à
l'étape 2 doit les attraper. Vérifier explicitement après écriture.

### 3. Ce qu'il ne faut PAS faire

- **Ne pas** fusionner avec la bande `DayCrossSummary`. Elle a ses propres clés
  (`['rapro','daily-agg-range', …]`, `['rapro','day', date]`), dont l'une est
  partagée avec le board de saisie qui y fait du `setQueryData` optimiste.
  L'étape 3 traite déjà sa cascade ; les deux chantiers restent distincts.
- **Ne pas** porter `carryOver` ni `raproDaySummary` en SQL.
- **Ne pas** toucher à `rapro_occupancy`.

### 4. Discipline d'application

Écrire → **commiter avant d'appliquer** → essayer en `begin … rollback` →
appliquer → **prouver l'équivalence avant de toucher au client** → modifier les
composants.

## Ordre d'exécution

1. Vérifier que la vue ne renvoie jamais de jour à zéro (fondement de
   l'équivalence des deux définitions d'`activeDays`).
2. Écrire et commiter le SQL, l'essayer en `rollback`, l'appliquer.
3. Prouver l'équivalence sur toutes les années et tous les mois.
4. Écrire les deux `fetch`, réécrire les deux boards.
5. `npx tsc --noEmit` + `npx vitest run` + `pnpm build`.

## Critère de validation

- Écarts SQL↔TS à **zéro** sur tout l'historique, y compris un mois sans aucune
  feuille validée et un mois à `rattrapage` seuls.
- `activeDays` identique entre la vue annuelle et la vue mensuelle sur le même
  mois — c'est le contrôle qui attrape le piège du point 1.
- La navigation annuel ↔ mois reste **instantanée** (cache partagé préservé) :
  vérifier qu'aucune requête ne part au retour.
- `['rapro','oldest']` est toujours consommée par `RaproBoard`.
- `rapro_occupancy` est inchangée, toujours `SECURITY DEFINER`.

## Contrôle qualité (revue)

Étape critique (fonctions en base, sécurité `definer` à préserver). `/borg`
n'étant pas installé, revue manuelle : (1) vérifier par requête sur `pg_proc`
que `rapro_occupancy` est **toujours** `prosecdef = true` et que les deux
nouvelles fonctions sont `false` ; (2) comparer `activeDays` annuel et mensuel
sur trois mois, dont un incomplet ; (3) confirmer que `cleaned > vendues` reste
possible et s'affiche comme avant sur un mois à rattrapages ; (4) naviguer
annuel → mois → annuel et confirmer dans l'onglet réseau qu'**aucune** requête
ne repart ; (5) confirmer qu'aucune clé n'est sortie du préfixe `['rapro', …]`.
