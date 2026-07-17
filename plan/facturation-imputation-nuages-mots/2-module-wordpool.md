# Étape 2 — Module `wordpool.ts` (métier pur)

## Objectif

Écrire la logique statistique, **pure et testable en Node** (comme `stampLayout.ts`
/ `grid.ts`) : tokenisation, poids automatiques par concentration (IDF), scoring en
probabilité, abstention, et amorçage depuis la graine.

## Contexte

Aucune tokenisation n'existe : `normalize()` (detect.ts) fait minuscule + retrait
d'accents mais ne découpe pas en mots. Le scoring actuel est du `includes` binaire.
Ce module introduit le paradigme « sac de mots pondéré ». Choix de scoring : D1
(recommandé TF-IDF centroïde cosinus + softmax pour l'affichage).

## Fichier(s) impacté(s)

- `src/lib/facturation/wordpool.ts` (nouveau)
- `src/lib/facturation/facturation.test.ts` (tests ajoutés)

## Travail à réaliser

### 1. Types & tokenisation

```ts
export interface WordPool {
  perCode: Record<string, Record<string, number>> // code → { token: count }
}
export interface Scored {
  code: string
  proba: number // softmax normalisé (affichage)
  score: number // cosinus brut (présélection)
  words: string[] // mots qui ont le plus voté (explicabilité)
}

const STOPWORDS = new Set([
  'facture', 'total', 'ttc', 'ht', 'tva', 'montant', 'date', 'numero', 'num',
  'commande', 'client', 'reference', 'ref', 'quantite', 'prix', 'unitaire',
  'de', 'la', 'le', 'les', 'des', 'du', 'un', 'une', 'et', 'ou', 'en', 'au',
  'aux', 'pour', 'par', 'sur', 'avec', 'sans', 'okko', 'nantes', /* nom+ville hôtel */
])

/** normalize → découpe en mots → hygiène : longueur 3–24, PAS de chiffre (écarte
 *  dates, montants, n° de facture, réfs = source principale de bruit), hors stop-words. */
export function tokenize(rawText: string): string[] {
  return normalize(rawText)
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length >= 3 &&
        t.length <= 24 &&
        !/\d/.test(t) && // tout token contenant un chiffre est écarté
        !STOPWORDS.has(t),
    )
}
```

### 2. Poids automatique par concentration (IDF au niveau des codes)

```ts
/** Agrégats dérivés du pool : df(token)=nb de codes le contenant, N=nb de codes. */
function stats(pool: WordPool) {
  const codes = Object.keys(pool.perCode)
  const df: Record<string, number> = {}
  const cf: Record<string, number> = {} // fréquence globale (anti-hapax)
  for (const c of codes)
    for (const [t, n] of Object.entries(pool.perCode[c])) {
      df[t] = (df[t] ?? 0) + 1
      cf[t] = (cf[t] ?? 0) + n
    }
  return { N: codes.length, df, cf, codes }
}

/** Poids : mot répandu → ~0 ; rare+concentré → fort ; vu 1 fois → 0. */
function idf(t: string, s: ReturnType<typeof stats>): number {
  if ((s.cf[t] ?? 0) < 2) return 0 // hapax ignoré
  const df = s.df[t] ?? s.N
  return Math.log(s.N / df) // 0 si présent partout, max si sur 1 code
}
```

### 3. Scoring TF-IDF centroïde cosinus → proba

```ts
export function scoreInvoice(rawText: string, pool: WordPool): Scored[] {
  const s = stats(pool)
  const tokens = tokenize(rawText)
  // vecteur requête q[t] = tf * idf, normalisé L2
  const tf: Record<string, number> = {}
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1
  const q: Record<string, number> = {}
  for (const [t, n] of Object.entries(tf)) q[t] = n * idf(t, s)
  const qn = norm(q)
  if (qn === 0) return [] // rien d'informatif → abstention en amont

  const scored: Scored[] = []
  for (const c of s.codes) {
    const v: Record<string, number> = {}
    for (const [t, n] of Object.entries(pool.perCode[c])) v[t] = n * idf(t, s)
    const vn = norm(v)
    if (vn === 0) continue
    let dot = 0
    const contrib: [string, number][] = []
    for (const [t, qv] of Object.entries(q)) {
      const cv = v[t] ?? 0
      if (cv) { dot += qv * cv; contrib.push([t, qv * cv]) }
    }
    const cos = dot / (qn * vn)
    if (cos <= 0) continue
    const words = contrib.sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0])
    scored.push({ code: c, score: cos, proba: 0, words })
  }
  // proba d'affichage = softmax des scores (température douce)
  softmaxInto(scored)
  return scored.sort((a, b) => b.score - a.score)
}
```

Helpers `norm(vec)` (L2) et `softmaxInto(scored)` (exp(score/τ) normalisé) à écrire.

### 4. Présélection multi-label + abstention (D7)

```ts
export const CLOUD_MIN = 0.15   // cosinus min pour proposer (τ_min)
export const CLOUD_MARGIN = 0.05 // écart top1/top2 en-deçà duquel on hésite

/** Codes à pré-sélectionner (un-contre-tous seuillé). */
export function preselect(scored: Scored[]): string[] {
  return scored.filter((x) => x.score >= CLOUD_MIN).map((x) => x.code)
}

/** Vrai si la preuve est trop mince pour trancher (à imputer à la main). */
export function abstains(scored: Scored[]): boolean {
  if (scored.length === 0) return true
  return scored[0].score < CLOUD_MIN
}
```

### 5. Graine additive (amorçage à froid, D8)

```ts
/** Pool de départ = SEED_RULES (poids fort) + hint des BUDGET_LINES (poids faible),
 *  fusionné avec le pool serveur. Toujours dispo, même sans table Supabase. */
export function seedPool(): WordPool { /* tokenize(keywords)×SEED_W + tokenize(hint)×HINT_W */ }
export function mergePools(a: WordPool, b: WordPool): WordPool { /* somme des counts */ }
```

### 6. Hygiène & bornage du vocabulaire (anti-monstre)

Ce qui garantit « l'ordre » à 250+ PDF — indépendant du nombre de factures :

- **À l'entrée** (tokenize) : chiffres/dates/montants/n° écartés (ci-dessus),
  stop-words FR, longueur bornée.
- **Hapax ignorés** : `cf(token) < 2` → poids 0 (déjà dans `idf`), et supprimés par
  l'élagage serveur (étape 1).
- **Ubiquité neutralisée** : un mot présent sur (presque) tous les codes → IDF ≈ 0 →
  n'influence rien ; candidat à l'élagage.
- **Plafond top-K par code** : `STORAGE_TOP_K = 300`. On ne conserve que les K tokens
  de plus fort `count` par code (bornage dur de la taille des nuages). Appliqué à
  l'élagage (étape 1) et/ou au merge.
- **Saturation des répétitions** (BM25) : au scoring, `tf_sat = tf·(k+1)/(tf+k)`
  (`k≈1.5`) — 100 factures identiques d'un même fournisseur ne noient pas un code.

```ts
export const STORAGE_TOP_K = 300
const BM25_K = 1.5
const satTf = (tf: number) => (tf * (BM25_K + 1)) / (tf + BM25_K)
```

### 7. Tests (Node)

- `tokenize` retire stop-words et mots courts.
- `idf` : mot présent partout → 0 ; mot sur 1 code → > 0 ; hapax → 0.
- `scoreInvoice` sur un pool jouet : « ascenseur » vote Technique, pas OTA.
- `abstains` vrai quand le texte n'a aucun mot informatif.
- `seedPool` : « booking » présent dans le pool de `HECOMMOTAo`.

## Ordre d'exécution

1. `wordpool.ts` (tokenize → idf → score → preselect/abstain → seed/merge).
2. Tests.
3. `npx tsc --noEmit` + `npx vitest run src/lib/facturation`.

## Critère de validation

- Module 100 % pur (aucun import React/DOM/Supabase) → tourne en vitest Node.
- Poids automatiques conformes (concentration), hapax ignorés.
- Scoring et abstention couverts par tests sur pool jouet.
