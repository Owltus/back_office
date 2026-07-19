# Étape 4 — Filtrage à l'affichage (galaxie + revue)

## Objectif

Masquer les parasites de l'AFFICHAGE du pull (panneau des mots de la galaxie, nébuleuse, comptes de
la revue) via la MÊME stoplist adaptative que le scoring — pour que « ce qu'on montre » = « ce qui
peut voter » (D1).

## Contexte

Diagnostic des agents : l'affichage lit `serverPool.perCode[code]` BRUT (aucun filtre parasite) à 3
endroits. Les stopwords statiques (couche 1) n'atteignent jamais le pool (filtrés dès `tokenize`),
donc rien à masquer pour eux ; ce sont les parasites STOCKÉS (adresses, noms, `legallais`, `accor`)
qu'il faut masquer, et la stoplist adaptative est leur masqueur direct (D1, option A). Un helper pur
unique garantit la cohérence des 3 sites.

## Fichier(s) impacté(s)

- `src/lib/facturation/wordpool.ts` (modif : `visibleWords`)
- `src/lib/facturation/galaxy.ts` (modif : `buildGalaxy` filtre les mots)
- `src/components/facturation/FacturationGalaxie.tsx` (modif : panneau des mots)
- `src/components/facturation/FacturationRevue.tsx` (modif : comptes « vocabulaire »)

## Travail à réaliser

### 1. Helper pur `visibleWords` (`wordpool.ts`)

```ts
/** Mots d'un code VISIBLES (hors stoplist), triés par fréquence décroissante. Le masquage à
 *  l'affichage rejoue la stoplist du scoring → UI cohérente avec ce qui peut voter. */
export function visibleWords(
  cell: Record<string, number>,
  stop?: ReadonlySet<string>,
): Array<[string, number]> {
  return Object.entries(cell)
    .filter(([t]) => !stop?.has(t))
    .sort((a, b) => b[1] - a[1])
}
```

### 2. Galaxie — panneau des mots + nébuleuse

- `FacturationGalaxie.tsx` : la stoplist vient de `useFacturationModel()` (étape 3). Le panneau
  latéral (`selected.words`) utilise `visibleWords(cell, stoplist)` au lieu de `Object.entries(cell)`.
  Le compteur « N mots » du titre doit refléter le filtrage (cf. `buildGalaxy` ci-dessous).
- `galaxy.ts` `buildGalaxy(pool, issuers, topWordsPerCode, minCount, issuerCodes, stop?)` : appliquer
  `visibleWords(cell, stop)` (ou un filtre `!stop?.has(token)`) AVANT le `.slice(0, topWordsPerCode)`
  et le `minCount`. Les nœuds `word` parasites disparaissent → la nébuleuse ne se déforme plus autour
  d'eux et `counts.word` est juste. `FacturationGalaxie` passe la stoplist à `buildGalaxy`.

### 3. Revue — comptes « vocabulaire »

`FacturationRevue.tsx` : les comptes `words: Object.keys(cell).length` (section « Vocabulaire
appris » + « Nuages sans émetteur ») deviennent `visibleWords(cell, stoplist).length` (stoplist de
`useFacturationModel`), pour que « 25 mots » colle à ce que la galaxie montre.

## Ordre d'exécution

1. `visibleWords` dans `wordpool.ts`.
2. `galaxy.ts` : filtrer les mots dans `buildGalaxy`.
3. `FacturationGalaxie.tsx` : panneau + `buildGalaxy(+stop)`.
4. `FacturationRevue.tsx` : comptes alignés.
5. `npx tsc --noEmit` + `npx vitest run` + `npx prettier --write` verts.

## Critère de validation

- Le panneau des mots (galaxie) et les comptes (revue) n'affichent plus les parasites de la stoplist ;
  cohérents entre eux et avec le scoring.
- La nébuleuse n'est plus déformée par des mots parasites ; `counts.word` juste.
- Dégradation gracieuse : stoplist vide → affichage identique à l'existant (aucun mot masqué).
- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
