# Étape 2 — max_df adaptatif + stoplist + top-K idf

## Objectif

Neutraliser les mots parasites (boilerplate transverse : adresses, mentions légales,
banque) pour des nuages discriminants, en s'appuyant sur les bonnes pratiques TF-IDF
(`max_df`) et en restant auto-adaptatif à mesure que la base grandit.

## Contexte

Diagnostic des agents : le socle gère déjà `min_df` (`cf<2→0`), BM25, et l'ubiquité totale
(`idf→0` quand `df=N`). Manque un `max_df` (ignorer un token présent dans une forte
FRACTION des codes, pas seulement tous) et une stoplist « boilerplate facture ». Le
`STORAGE_TOP_K` (300) n'est appliqué qu'au `prune` SQL, par count brut.

## Fichier(s) impacté(s)

- `src/lib/facturation/wordpool.ts` (`idf`, `STOPWORDS`, éventuel top-K dans `vectorize`)
- `src/lib/facturation/facturation.test.ts`

## Travail à réaliser

### 1. max_df adaptatif (dans `idf`) — AVEC garde anti-casse

```ts
const MAX_DF_RATIO = 0.6      // token présent dans ≥ 60 % des codes → parasite
const MAXDF_MIN_CODES = 8     // garde : ne s'active qu'au-delà de 8 codes (protège les tests)

function idf(t, s) {
  if ((s.cf[t] ?? 0) < 2) return 0
  const df = s.df[t] ?? s.N
  if (s.N >= MAXDF_MIN_CODES && df / s.N >= MAX_DF_RATIO) return 0 // max_df
  return Math.log(s.N / df)
}
```

CRITIQUE (diagnostic agent) : sans le garde `MAXDF_MIN_CODES`, un `max_df` bas met à 0 le
token `alpha` (partagé par 2 codes sur 3 dans les fixtures) et casse les tests `preselect` /
départage émetteur. Le garde `N ≥ 8` neutralise tous les pools de test (≤ 3 codes) →
déterminisme + tests préservés ; en prod (≈ 50 codes) le max_df est actif.

### 2. Stoplist boilerplate (extension de `STOPWORDS`)

Ajouter : `siret, siren, rcs, ape, naf, iban, bic, sas, sarl, eurl, cedex, rue, avenue,
tel, fax, mail, www, france` (`tva` déjà présent). Un seul chemin de filtrage (`tokenize`),
coût nul. Attention : ne pas dupliquer `LEGAL_SUFFIXES` (`text.ts`) sans note de cohérence.

### 3. Top-K par idf (D2, option A)

- Par défaut : NE PAS ajouter de top-K systématique. Les mots à idf≈0 pèsent déjà 0 au
  scoring ; le `prune` SQL par count reste pour la rétention disque.
- Optionnel (si profilage) : un top-K client dans `vectorize` (garder les K plus gros
  `satTf×idf` par code) avec tie-break stable. À décider après mesure.
- Hygiène galaxie : `buildGalaxy` fait déjà un `slice(topWordsPerCode)` par count — peut
  passer au tri par idf (cohérent avec le nettoyage), sans impact scoring.

### 4. Tests

- Vérifier `tokenize` (aucun mot testé — `reparation`, `ascenseur` — n'entre dans la stoplist).
- Vérifier que les pools de test (≤ 3 codes) ne déclenchent pas le max_df (garde N≥8).
- Ajouter un test max_df : pool ≥ 8 codes, un token présent dans ≥ 60 % → `idf = 0`.

## Ordre d'exécution

1. `idf` (max_df gardé) + `STOPWORDS` (boilerplate).
2. (Optionnel) top-K idf galaxie.
3. Tests. `npx tsc --noEmit` puis `npx vitest run src/lib/facturation`.

## Critère de validation

- Un pool ≥ 8 codes : un token « trop fréquent » (≥ 60 % des codes) est ignoré au scoring.
- Les fixtures ≤ 3 codes restent inchangées (garde N≥8) → tests existants verts.
- Les mots boilerplate ne participent plus au scoring.
- `npx tsc --noEmit` et `npx vitest run` verts.
