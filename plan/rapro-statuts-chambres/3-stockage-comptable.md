# Étape 3 — Sémantique de stockage + cohérence comptable

## Objectif

Appliquer la décision de stockage (**D2**) dans `setStatus`, et réconcilier les
trois consommateurs des statuts — `monthly` (facturation ELIOR), `reconcile`
(balance du jour) et `carryover` (roulement) — pour que le comptage facturable et
le roulement restent justes après l'inversion du défaut et l'ajout des nouveaux
statuts. C'est l'étape la plus risquée du chantier.

## Contexte

Trois couplages fragiles identifiés par la reconnaissance :

- `service.ts` (`setStatus`, l.52-73) traite `non_nettoyee` comme la valeur NON
  stockée (elle supprime la ligne) ; tout autre statut fait un upsert. Le payload
  client légitime est `report_date, room, status` uniquement — ne JAMAIS envoyer
  `created_by`/`updated_at` (estampillés serveur par le trigger `rapro_rooms_stamp`).
- `monthly.ts` (facturation ELIOR) compte les LIGNES STOCKÉES via
  `.in('status', ['nettoyee','refus','noshow'])` (l.37) et boucle
  `r.status === 'nettoyee'` (l.49). **Si `nettoyee` devient le défaut non stocké,
  les chambres nettoyées disparaissent de la base → le récap facturable tombe à
  ZÉRO, sans erreur de compilation.** C'est le risque central de tout le chantier.
- `JUSTIFIED_STATUSES` (constants.ts:34) alimente à la fois `reconcile.isSettled`
  (reconcile.ts:26-27) et `carryover.isResolved` (carryover.ts:39-44).
  `reconcile.pending` (reconcile.ts:42) se calcule par SOUSTRACTION
  (`due − clean − settled`) : tout statut non listé compte comme « dû non fait ».
  `carryover` fait rouler (borné 7 j) toute chambre occupée non résolue.

## Fichier(s) impacté(s)

- `src/lib/rapro/service.ts` (modifié)
- `src/lib/rapro/monthly.ts` (modifié)
- `src/lib/rapro/reconcile.ts` (modifié)
- `src/lib/rapro/carryover.ts` (modifié)
- `src/lib/rapro/constants.ts` (modifié — `JUSTIFIED_STATUSES`)

## Travail à réaliser

### 1. Sémantique de stockage (`setStatus`) — D2 tranchée : découpler

Conserver `non_nettoyee` comme marqueur d'absence (suppression de ligne), mais
écrire une VRAIE ligne `nettoyee` dès qu'une chambre vendue doit être facturée
(défaut affiché géré côté application, cf. étape 4). `monthly` continue de compter
des lignes réelles → aucun changement destructeur côté facturation. Ne PAS
inverser la convention « absence = `nettoyee` » (elle ferait tomber ELIOR à zéro).

### 2. `JUSTIFIED_STATUSES` — D3/D4 tranchées

```ts
// Statuts « hors charge » : exclus de la balance ET du roulement, NON facturables.
export const JUSTIFIED_STATUSES = ['refus', 'noshow', 'bloque'] as const
// 'faux_noshow' N'Y FIGURE PAS : le client est en réalité présent (D4), la
// chambre est occupée et nettoyée → elle est FACTURABLE et se comporte comme
// 'nettoyee' (résolue, settled), pas comme un hors charge.
```

### 3. `reconcile` et `carryover`

- `reconcile.isSettled` / `pending` : `refus`, `noshow`, `bloque` sortent en
  « settled » (hors charge) ; `faux_noshow` compte dans le bucket « clean »
  (comme `nettoyee`). Comme `pending` est une soustraction, vérifier qu'aucun
  statut ne reste orphelin (sinon il gonfle la balance).
- `carryover.isResolved` : doit renvoyer `true` pour `nettoyee`, `faux_noshow`
  (facturable/résolu) ET les `JUSTIFIED_STATUSES` — afin qu'aucun de ces statuts
  ne roule au jour suivant.

### 4. `monthly` (ELIOR) — vérification prioritaire

Inclure `faux_noshow` dans le comptage FACTURABLE aux côtés de `nettoyee`
(`.in('status', ['nettoyee','faux_noshow','refus','noshow'])` selon la logique de
comptage, et boucle de facturable `status === 'nettoyee' || status ===
'faux_noshow'`). `bloque` reste exclu du facturable. **Relire le récap sur un mois
de test réel** — c'est le point de contrôle le plus important.

## Ordre d'exécution

1. Acter D2, D3, D4 (bloquant).
2. Adapter `setStatus` selon D2.
3. Mettre à jour `JUSTIFIED_STATUSES` puis `reconcile` et `carryover`.
4. Ajuster `monthly` et relire un récap de mois test.
5. `npx tsc --noEmit`.

## Critère de validation

- Sur un jour test : une chambre vendue non touchée s'affiche `nettoyee` et est
  comptée facturable dans `monthly` (récap ELIOR NON nul).
- Une chambre `bloque` sort de la balance `reconcile` et ne roule pas dans
  `carryover`.
- `faux_noshow` compte comme facturable (bucket `nettoyee`), sort de la balance
  et ne roule pas.
- `reconcile.pending` retombe à zéro sur un jour entièrement traité.
- `npx tsc --noEmit` vert.

## Contrôle /borg

Étape critique (couplage facturation ELIOR, 5 fichiers). Auditer :
- `monthly.ts` ne peut pas retourner un récap systématiquement nul après le
  changement de convention de stockage (tracer un cas vendu → nettoyé → facturé).
- Aucun payload d'écriture ne contient `created_by`/`updated_at`/`imported_by`
  (colonnes serveur) ni ne fixe des colonnes estampillées.
- Chaque valeur de `RoomStatus` est classée sans ambiguïté dans exactement une
  catégorie comptable (clean / settled / pending) — pas de statut « orphelin »
  qui gonfle la balance par soustraction.
- `carryover` ne peut pas faire rouler indéfiniment un nouveau statut.
