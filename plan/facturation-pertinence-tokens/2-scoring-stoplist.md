# Étape 2 — Intégration de la stoplist au scoring (idf → 0)

## Objectif

Brancher la stoplist adaptative (couche 2) sur le scoring : un token de la stoplist est mis à
`idf = 0` (jumeau exact du `max_df`), donc exclu des vecteurs requête ET code, du produit scalaire,
des normes et des `words`. Le paramètre reste OPTIONNEL et rétro-compatible.

## Contexte

Diagnostic des agents : le scoring a un seul appelant (`detect.ts:162`). Les tests appellent
`detect(...)` et `scoreInvoice(...)` en POSITIONNEL (`issuer` en 4e position de `detect`) → le
nouveau paramètre doit être OPTIONNEL et en DERNIÈRE position, sinon casse. Le mécanisme `idf==0`
est déjà celui du `max_df` (`wordpool.ts:218-223`) → réutilisation directe, cohérence maximale.

## Fichier(s) impacté(s)

- `src/lib/facturation/wordpool.ts` (modif : `scoreInvoice`, `computeStats`, `idf`)
- `src/lib/facturation/detect.ts` (modif : `detect`, `redetect`)
- `src/lib/facturation/facturation.test.ts` (modif : test stoplist au scoring)

## Travail à réaliser

### 1. `wordpool.ts` — porter la stoplist jusqu'à `idf`

- `computeStats(pool, stop?)` : stocke `stop` dans l'objet `Stats` (nouveau champ `stop?:
  ReadonlySet<string>`).
- `idf(t, s)` : première ligne
  ```ts
  if (s.stop?.has(t)) return 0
  ```
  (avant les autres tests : hapax, max_df). Un token de la stoplist → poids 0 partout.
- `scoreInvoice(rawText, pool, stop?)` : passe `stop` à `computeStats(pool, stop)`.

Rétro-compat : `codeCosine`/`confusableCodes` appellent `computeStats(pool)` SANS stoplist →
comportement inchangé (`stop` undefined → `s.stop?.has` toujours faux).

### 2. `detect.ts` — propager `stop?` en dernière position

```ts
export function detect(
  rawText: string,
  rules: SupplierRule[] = allRules(),
  pool?: WordPool,
  issuer?: IssuerHint,
  stop?: ReadonlySet<string>, // NOUVEAU, dernier, optionnel
): Detection {
  // …
  const scoredRaw = pool ? scoreInvoice(rawText, pool, stop) : []
  // …
}

export function redetect(
  text: string,
  pool: WordPool,
  issuer?: IssuerHint,
  stop?: ReadonlySet<string>,
): { detection: Detection; codes: string[] } {
  const detection = detect(text, undefined, pool, issuer, stop)
  return { detection, codes: detection.codes }
}
```

Comme le filtrage se fait EN AMONT du scoring, il propage automatiquement l'exclusion aux `scores[].words`
(affichage des mots votants) — un seul point à toucher.

### 3. Test

```ts
// Un token présent dans le pool mais mis en stoplist ne vote plus.
const d = detect('alpha bravo', undefined, POOL, undefined, new Set(['alpha']))
// → le code que seul « alpha » soutenait n'est plus proposé / sa proba chute.
```

## Ordre d'exécution

1. `wordpool.ts` : `computeStats`/`idf`/`scoreInvoice` + `stop?`.
2. `detect.ts` : `detect`/`redetect` + `stop?` en dernier.
3. Test scoring filtré.
4. `npx tsc --noEmit` + `npx vitest run src/lib/facturation` verts.

## Critère de validation

- Une stoplist non vide exclut ses tokens du scoring (score + `words`), sans stoplist le
  comportement est identique à l'existant (tous les tests positionnels passent).
- `codeCosine`/`confusableCodes` inchangés.
- `npx tsc --noEmit`, `npx vitest run` verts.
