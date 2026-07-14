# Étape 3 — Balance / roulement / ELIOR sur le statut de BASE

## Objectif

Garantir que la réconciliation (balance), le roulement (reportées) et la
facturation ELIOR raisonnent sur le **statut de base**, le qualificatif étant
orthogonal. C'est le cœur du risque comptable du chantier.

## Contexte

Aujourd'hui `faux_noshow` (statut plat) court-circuite tout vers « facturable /
résolu » : `reconcile.ts` (`nettoyee || faux_noshow → clean`), `carryover.ts`
(`isResolved` inclut `faux_noshow`), `monthly.ts` (`.in('status',
['nettoyee','faux_noshow',…])`, `faux_noshow` fondu dans le compteur facturable).
Une fois `faux_noshow` devenu un qualificatif (étape 2), ces trois modules
doivent lire le **base** et ignorer le qualificatif. Décision **D3** : la
facturation suit le base (`faux_noshow + refus` = NON facturable).

## Fichier(s) impacté(s)

- `src/lib/rapro/reconcile.ts` (modifié)
- `src/lib/rapro/carryover.ts` (modifié)
- `src/lib/rapro/monthly.ts` (modifié)

## Travail à réaliser

### 1. reconcile.ts

- `isSettled(base)` = `JUSTIFIED_STATUSES.includes(base)` (`refus`/`noshow`).
- Boucle : `base === 'nettoyee' → clean++` ; `isSettled(base) → settled++` ;
  le reste (`non_nettoyee`) → `pending`. **`faux_noshow` disparaît de la boucle**
  (ce n'est plus un base) — une chambre `faux_noshow + nettoyee` compte via son
  base `nettoyee`. Lire `statusOf(...).base`.

### 2. carryover.ts

- `isResolved(base)` = `base === 'nettoyee' || JUSTIFIED_STATUSES.includes(base)`.
  Seul `non_nettoyee` roule. `resolvedSince` s'appuie sur le base uniquement.
  Un qualificatif posé (ex. `faux_noshow`) ne résout PAS une chambre encore
  `non_nettoyee` : elle continue de rouler tant que le base n'est pas résolu.

### 3. monthly.ts (ELIOR)

- Le récap compte des LIGNES stockées. Facturable = **base `nettoyee`**
  (matérialisé à la clôture), indépendamment du qualificatif. Requête :
  `.in('status', ['nettoyee','refus','noshow'])` (base) — `faux_noshow` n'est plus
  une valeur de `status`. Le compteur facturable = lignes `status='nettoyee'`.
- Décider (D3) si un reporting « nb de faux no-show » est voulu : lecture séparée
  de `qualifier='faux_noshow'` (facultatif, non bloquant pour la facturation).

## Ordre d'exécution

1. Acter D3 (facturation suit le base).
2. Adapter `reconcile`/`carryover` pour lire `.base`.
3. Réécrire la requête et le comptage de `monthly` sur les bases.
4. Relire un récap ELIOR sur un mois test.
5. `npx tsc --noEmit`.

## Critère de validation

- `faux_noshow + nettoyee` : facturable, résolu, ne roule pas (via base).
- `faux_noshow + refus` : NON facturable, hors charge (via base `refus`).
- `faux_noshow + non_nettoyee` : dû non fait → dans la balance ET roule.
- Récap ELIOR non nul et cohérent sur le mois test.
- `npx tsc --noEmit` vert.

## Contrôle /borg

Étape critique (facturation ELIOR + balance). Auditer :
- Aucun chemin ne fait dépendre la facturation du qualificatif (elle suit le base).
- Chaque base tombe dans exactement une catégorie (clean/settled/pending) — pas
  d'orphelin gonflant `pending` par soustraction.
- `carryover` ne peut pas figer (résoudre à tort) une chambre `non_nettoyee`
  parce qu'elle porte un qualificatif.
- Le récap ELIOR ne peut pas tomber à zéro (tracer vendu → nettoyé → facturé).
