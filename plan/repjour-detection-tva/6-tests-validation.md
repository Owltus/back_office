# Étape 6 — Tests et validation globale

## Objectif

Verrouiller la nouvelle détection par des tests unitaires ciblés (le métier pur se
teste facilement, sans réseau) et valider l'ensemble (tsc / build / vitest / lint).

## Contexte

La logique vit dans `calc/validate.ts` (fonctions pures) : `isVatConsistent`
(self-check réalisé) et `validateForecast` (référence TTC). Ce sont des entrées →
sorties déterministes, idéales pour vitest. Il n'existe pas encore de
`validate.test.ts`.

## Fichier(s) impacté(s)

- `src/lib/repjour/calc/validate.test.ts` (nouveau)

## Travail à réaliser

### 1. Tests du self-check réalisé (`isVatConsistent`)

```ts
// TVA nulle sur un montant significatif → incohérent (HT détecté)
expect(isVatConsistent(10000, 0)).toBe(false)
// TVA ≈ 10 % → cohérent
expect(isVatConsistent(10000, 1000)).toBe(true)
// montant sous le plancher → on ne juge pas (true)
expect(isVatConsistent(5, 0)).toBe(true)
```

### 2. Tests de `validateForecast` (référence TTC)

- forecast ~10 % sous la référence réalisé → alerte `tvaMissing` ;
- forecast proche de la référence → aucune alerte TVA ;
- forecast franchement différent (hors ±10 %) → aucune alerte TVA (souple) ;
- `ref === null` → aucune alerte TVA, pas de crash ;
- non-régression : `empty`, `impossible`, `occNoRev`, `adrWeird` inchangés.

### 3. Non-régression `validateCoherence`

Vérifier que les contrôles existants (négatifs, inventaire, room/revenue) ne sont
pas cassés par l'ajout du self-check TVA.

## Ordre d'exécution

1. Écrire `validate.test.ts`.
2. `npx vitest run src/lib/repjour/`.
3. `npx tsc --noEmit`.
4. `npx eslint` sur les fichiers touchés.
5. `pnpm build`.

## Critère de validation

- Tests verts, couvrant : self-check (TVA nulle / correcte / plancher), référence
  (missing / proche / éloigné / null), non-régression.
- `npx tsc --noEmit`, `pnpm build`, `vitest` et `eslint` sans erreur nouvelle.

## Contrôle /borg

Étape finale (validation globale). Auditer :
- couverture réelle des cas HT/TTC (pas seulement les cas heureux) ;
- aucune régression sur les autres alertes de validation ;
- cohérence bout-en-bout : un fichier HT importé est bien remonté, un fichier TTC
  normal passe sans friction ;
- aucun `10` magique résiduel ; toute la TVA passe par `VAT_RATE` / `VAT_FACTOR`.
