# Étape 1 — Centraliser le taux TVA

## Objectif

Faire du taux de TVA une source unique (`VAT_RATE`) et supprimer le `10` codé en
dur du parsing. Fondation sans changement de comportement : les étapes 2 et 3
raisonneront ensuite en termes de « facteur TVA » cohérent, jamais en littéraux
magiques dupliqués.

## Contexte

`VAT_RATE = 10` existe déjà (`constants.ts:2`) avec `toTTC(ht) = ht * (1 + VAT_RATE/100)`,
mais `parse/forecast.ts:51` recalcule le HT avec un `10` en dur
(`revTTC / (1 + 10 / 100)`), et `validate.ts` encode le 1,10 dans des bandes
littérales (0.89-0.93, 1.08-1.12…) sans référence au taux.

## Fichier(s) impacté(s)

- `src/lib/repjour/constants.ts`
- `src/lib/repjour/parse/forecast.ts`

## Travail à réaliser

### 1. Ajouter un helper `fromTTC` (et exposer le facteur)

Dans `constants.ts`, à côté de `toTTC`, ajouter l'inverse et un facteur nommé :

```ts
/** Facteur TTC = 1 + taux/100 (ici 1,10). Source unique pour toute conversion. */
export const VAT_FACTOR = 1 + VAT_RATE / 100
/** HT à partir d'un TTC (inverse de toTTC). */
export function fromTTC(ttc: number): number {
  return ttc / VAT_FACTOR
}
```

### 2. Remplacer le `10` magique du parsing forecast

Dans `parse/forecast.ts:50-51`, utiliser `fromTTC` :

```ts
const revTTC = parseFloat(row[7]) || 0
const revHT = fromTTC(revTTC) // REV du forecast est déjà TTC
```

### 3. Ne PAS toucher aux bandes de `validate.ts` ici

Les seuils de ratio de `validate.ts` seront revus dans les étapes 2 et 3 (avec la
nouvelle logique). Cette étape se limite à la conversion, pour rester sans effet
de bord.

## Ordre d'exécution

1. Ajouter `VAT_FACTOR` et `fromTTC` dans `constants.ts`.
2. Importer et utiliser `fromTTC` dans `parse/forecast.ts`.
3. `npx tsc --noEmit`.

## Critère de validation

- `parse/forecast.ts` n'a plus de `10` en dur pour la TVA.
- `npx tsc --noEmit` sans erreur.
- Aucun changement de valeur produite (comportement identique) : `revHT` reste
  `revTTC / 1,10`.
