# Étape 2 — Métier pur : `autoModeTargets(dayRows)`

## Objectif

Isoler dans le métier pur (sans React ni Supabase) la règle qui décide **quelles chambres cocher et à quelle valeur** quand on lance l'automode : la liste des `(room, served)` à poser, dérivée du rapport financier du jour. Fonction pure, testable.

## Contexte

Le « rapport financier » d'une chambre repose sur `breakfastCode(addons)` (`src/lib/pdj/breakdown.ts:28`) et `breakfasts_included` : une chambre est **facturée / incluse** quand `breakfasts_included > 0` avec un code PDJ présent (`breakfastCode(addons) != null`) OU `manual_kind === 'inclus'` (cf. la règle identique dans `roomFinance` / `computePdjCA`, `breakdown.ts:161`/`:127`). Le nombre à poser est exactement `breakfasts_included` (le dû, déjà plafonné à 2 côté serveur).

Décisions appliquées :
- **D2** : viser `breakfasts_served = breakfasts_included` (le dû), jamais d'extra → cohérent avec `computePdjCA` (aucun extra inventé).
- **D3** : n'inclure que les chambres à `breakfasts_served === 0` (anti-écrasement, idempotent).
- Exclure les lignes `manual_kind === 'extra'` (`included = 0`, hors périmètre inclus).

## Fichier(s) impacté(s)

- `src/lib/pdj/automode.ts` (nouveau)
- `src/lib/pdj/automode.test.ts` (nouveau)

## Travail à réaliser

### 1. Écrire la fonction pure

Réutiliser `breakfastCode` de `breakdown.ts`. Typer l'entrée sur les lignes du jour (`PdjDayRow` / `CaRow`, champs utiles : `room`, `addons`, `manual_kind`, `breakfasts_included`, `breakfasts_served`).

```ts
export interface AutoModeTarget {
  room: number
  served: number // valeur à poser (= breakfasts_included, le dû facturé)
}

/**
 * Chambres à cocher pour l'automode : celles facturées (code PDJ présent ou
 * manual_kind 'inclus') avec breakfasts_included > 0, ET pas encore saisies
 * (breakfasts_served === 0). Pose served = breakfasts_included (le dû). Ne
 * touche jamais aux extras ni aux chambres déjà cochées.
 */
export function autoModeTargets(rows: PdjDayRow[]): AutoModeTarget[] {
  const out: AutoModeTarget[] = []
  for (const r of rows) {
    const isBilled =
      (breakfastCode(r.addons) != null || r.manual_kind === 'inclus') &&
      r.breakfasts_included > 0
    if (isBilled && (r.breakfasts_served ?? 0) === 0) {
      out.push({ room: r.room, served: r.breakfasts_included })
    }
  }
  return out
}
```

### 2. Helper « jour vierge » (optionnel, pour l'UI)

Petit prédicat réutilisable par le board pour un message adapté :

```ts
export const isPdjDayBlank = (rows: PdjDayRow[]): boolean =>
  rows.every((r) => (r.breakfasts_served ?? 0) === 0)
```

### 3. Tests (`automode.test.ts`)

Couvrir : chambre facturée non saisie → ciblée à `included` ; chambre facturée **déjà** saisie (`served > 0`) → exclue (D3) ; chambre sans code PDJ / `TAXE` → exclue ; `manual_kind='inclus'` avec `included>0` → ciblée ; `manual_kind='extra'` (`included=0`) → exclue ; jour entièrement vide vs jour partiel pour `isPdjDayBlank`.

## Ordre d'exécution

1. Créer `automode.ts` (import `breakfastCode`).
2. Créer `automode.test.ts`.
3. `npx vitest run src/lib/pdj/automode.test.ts`.

## Critère de validation

- `npx tsc --noEmit` passe.
- `npx vitest run src/lib/pdj` : tous verts, y compris les nouveaux cas.
- Aucune dépendance à React ni au client Supabase dans `automode.ts` (métier pur).
