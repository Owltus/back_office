# Étape 3 — Suppression de la cascade rapro de la bande de synthèse

## Objectif

Supprimer un aller-retour **en cascade** dans `DayCrossSummary`, sans écrire une
ligne de SQL et sans changer un seul chiffre affiché.

## Contexte

Mesure du 2026-09-23 sur `/repjour` en production, la bande de synthèse :

```
 2406 -> 6334  pdj_breakfasts
 ...
 6287 -> 7023  rapro_rooms      <- démarre APRÈS la fin des précédentes
 6331 -> 6707  rapro_rooms
 6710 -> 7148  rapro_rooms
```

La chaîne exacte (`DayCrossSummary.tsx:306-329`) :

```
D4 ['rapro','oldest']                 fetchOldestDay → min(report_date)
      │ .data
      ▼
windowDays = carryoverWindow(date, raproOldestQ.data ?? date)
      │  rangeFrom = windowDays[0] ; rangeTo = windowDays.at(-1)
      ▼
D5 ['rapro','days-range', rangeFrom, rangeTo]   enabled: windowDays.length > 0
```

Le point exact qui sérialise (`carryover.ts:65-75`) : tant que `D4.data` est
`undefined`, le repli vaut `date`, donc `lowerBound = date`, donc
`start = max(date-7, date) = date`, donc la boucle `for (d = start; d < current)`
ne produit **aucun jour** → `windowDays = []` → `enabled: false`. D5 ne peut
physiquement pas partir avant le retour de D4. Cascade stricte à deux étages,
soit un aller-retour complet perdu (~170 ms à chaud, jusqu'à 1,37 s à froid), et
D5 arrive en plus dans la file de six alors que la salve est déjà en cours.

**Rectification d'une observation antérieure** : j'avais décrit « trois lectures
`rapro_rooms` qui s'attendent ». C'est faux. Seules D4→D5 s'attendent ; D3
(`['rapro','day', date]`) part en parallèle dès que les droits sont connus.

## Ce que dit l'analyse du code

`fetchOldestDay` **ne sert à rien ici**, et c'est démontrable :

1. `carryoverWindow` n'utilise `lowerBound` que pour **raccourcir** la fenêtre
   de 7 jours quand l'historique est plus court.
2. `groupRowsByDay` (`dayRows.ts:63-71`) produit un instantané **vide** pour
   tout jour sans ligne.
3. `isResolved` (`carryover.ts:53-58`) traite un instantané vide comme
   « résolue ».

Un jour antérieur au plus ancien enregistré n'a, par construction, aucune ligne
→ instantané vide → aucune origine de roulement, aucune résolution parasite.
Donc `carryOver([...7 jours dont des jours pré-historiques])` produit
**exactement le même `Set`** que `carryOver([...jours ≥ oldest])`.

La borne `oldest` garde un vrai rôle ailleurs — borner la **navigation** dans
`RaproBoard`, `RaproAnalytiqueBoard` et `RaproMonthlyBoard`. On ne la retire que
de la bande.

⚠ **Cette démonstration est une lecture de code, pas une exécution.** Elle doit
être prouvée par un test avant d'être appliquée (point 1 ci-dessous). C'est le
seul risque de l'étape.

## Fichier(s) impacté(s)

- `src/lib/rapro/carryover.test.ts` (modifié : cas d'équivalence ajouté)
- `src/components/repjour/DayCrossSummary.tsx` (modifié : `raproOldestQ` retiré)

## Travail à réaliser

### 1. Prouver l'équivalence par un test AVANT de toucher au composant

Ajouter à `carryover.test.ts` un cas qui compare les deux fenêtres sur le même
jeu de lignes :

```ts
// Une fenêtre bornée par `oldest` et une fenêtre de 7 jours pleins doivent
// produire le MÊME ensemble de chambres reportées, parce que les jours
// antérieurs à l'historique n'ont aucune ligne et qu'un instantané vide est
// traité comme « résolu ». C'est ce qui autorise DayCrossSummary à se passer
// de la lecture `rapro/oldest` (étape 3 du chantier du 2026-09-23).
```

Le cas doit couvrir : historique plus court que 7 jours, historique plus long,
historique vide, et un trou au milieu de la fenêtre. Idéalement en étendant la
suite *property-based* existante (`carryover.property.test.ts`) plutôt qu'en
ajoutant des cas à la main.

### 2. Retirer la lecture de la bande

Remplacer :

```ts
const windowDays = useMemo(
  () => carryoverWindow(date, raproOldestQ.data ?? date),
  [date, raproOldestQ.data],
)
```

par une fenêtre pleine, et supprimer `raproOldestQ` ainsi que son `useQuery`.
Le `enabled: litRapro && windowDays.length > 0` de D5 devient `enabled: litRapro`
— la fenêtre n'est plus jamais vide.

⚠ Conserver un commentaire daté expliquant **pourquoi** la borne a disparu ici
et pourquoi elle reste ailleurs. Sans lui, la prochaine lecture du code
conclura à un oubli et la réintroduira.

### 3. Ce qu'il ne faut PAS faire

- **Ne pas** porter `carryOver` en SQL. C'est un algorithme à état
  (`resolvedSince`, priorité du statut terminal sur le liseré manuel,
  `carryover.ts:87-114`) couvert par une suite *property-based*. Rapatrier les
  lignes brutes et laisser le calcul en TypeScript est le bon découpage.
- **Ne pas** en profiter pour fusionner D3 et D5 (mêmes colonnes, plages
  adjacentes). C'est tentant et probablement juste, mais D3 porte la clé
  `['rapro','day', date]` **partagée avec le board de saisie**, qui y fait du
  `setQueryData` optimiste (`RaproBoard.tsx:477-495`). La fusion ferait perdre
  ce partage. À traiter séparément, avec sa propre mesure.

## Ordre d'exécution

1. Écrire le test d'équivalence et le voir **passer** sur le code actuel.
2. Retirer `raproOldestQ` de la bande.
3. Revoir le test : il doit toujours passer.
4. `npx tsc --noEmit` + `npx vitest run`.
5. Mesurer sur `/repjour` : la cascade doit avoir disparu du chronogramme.

## Critère de validation

- Le test d'équivalence passe **avant et après** la modification.
- Sur un chargement de `/repjour`, plus aucune requête `rapro_rooms` ne démarre
  après la fin d'une autre (plus de cascade dans le chronogramme).
- Une requête de moins au total sur la page.
- Les chiffres de la bande rapro (« bloquées la veille » en particulier) sont
  identiques avant et après, vérifiés à l'écran sur au moins trois jours dont
  un avec report.
