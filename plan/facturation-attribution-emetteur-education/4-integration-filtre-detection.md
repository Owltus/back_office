# Étape 4 — Filtre émetteur dans la détection

## Objectif

Intégrer le prior émetteur (étape 2) dans `detect`/`redetect` : combiner
`P(code | émetteur)` avec la proba des mots, avec garde de maturité par émetteur (D6) et
anti-collapse (D3). Marquer l'origine de chaque suggestion (émetteur vs mots vs règle) pour
l'affichage. Adapter les tests figés impactés.

## Contexte

Diagnostic des agents : `detect(rawText, rules, pool)` ne reçoit jamais l'émetteur. Le
filtre fort exige un nouveau paramètre OPTIONNEL (rétro-compat des appels 3-args des tests).
Combinaison retenue (D3, option A) : multiplicative douce + filtre dur seulement si
émetteur mûr ET concentré ; émetteur absent/immature → comportement actuel (mots seuls).
L'abstention reste gardée sur le cosinus des mots (ne jamais laisser le prior seul trancher
sur une base émetteur immature).

## Fichier(s) impacté(s)

- `src/lib/facturation/detect.ts` (`detect`, `redetect`)
- `src/lib/facturation/wordpool.ts` (combinaison prior × proba dans/à côté de `scoreInvoice`)
- `src/lib/facturation/types.ts` (`Detection.scores[].source`)
- `src/lib/facturation/facturation.test.ts` (tests adaptés + nouveaux)

## Travail à réaliser

### 1. Signature étendue (rétro-compatible)

```ts
export function detect(
  rawText: string,
  rules: SupplierRule[] = allRules(),
  pool?: WordPool,
  issuerPrior?: Record<string, number>, // P(code|émetteur), déjà filtré par maturité (étape 2)
): Detection
// redetect(text, pool, issuerPrior?) idem
```

Le prior est PRÉ-calculé par l'appelant (étape 5) : `issuerPrior(model, key)` seulement si
`issuerMaturity(model, key).strong`, sinon `undefined` → aucun effet.

### 2. Combinaison (D3, option A)

- Sur chaque `Scored` des nuages : `probaFinale = proba × (EPS_PRIOR + prior[code])` avec
  `EPS_PRIOR` petit (ex. 0.15) pour ne pas annuler un code non vu chez l'émetteur.
- Filtre dur conditionnel : si l'émetteur est CONCENTRÉ (mono-code confirmé), restreindre
  `preselect` aux codes de `prior` — sinon simple re-pondération (départage), anti-collapse.
- Marquer `source`: `'issuer'` si le prior a fait remonter/gagner le code, `'words'` sinon,
  `'rule'` pour la couche 1.
- Abstention inchangée : gardée sur `bestCosine` des mots (`abstains`).

### 3. Type Detection

```ts
scores?: { code: string; proba: number; words: string[]; source?: 'issuer' | 'words' | 'rule' }[]
```

### 4. Tests à adapter (identifiés par l'agent tests)

- `une règle apprise démarre avec une confiance plus haute` (l.162) → réécrire autour du
  nouveau chemin (émetteur reconnu ⇒ prior fort), la notion de `SupplierRule.learned` étant
  supplantée.
- `un nuage MÛR et FORT est proposé même si une règle tranche ailleurs` (l.130) → revalider
  avec `issuerPrior` neutre (le texte n'a pas d'émetteur) : comportement inchangé attendu.
- `électricité : … pull APPRIS` (l.92) et `redetect` (l.179) → appels sans `issuerPrior`
  (param optionnel) → doivent rester verts.
- Nouveaux tests : émetteur concentré ⇒ filtre dur sur ses codes ; émetteur multi-codes ⇒
  départage sans exclusion ; émetteur immature ⇒ aucun effet (prior undefined).

## Ordre d'exécution

1. Étendre `types.ts` (`source`).
2. Étendre `detect`/`redetect` + combinaison dans `wordpool.ts`.
3. Adapter les tests figés, ajouter les nouveaux.
4. `npx tsc --noEmit` puis `npx vitest run src/lib/facturation`.

## Critère de validation

- `detect(text, rules, pool)` (sans prior) donne EXACTEMENT le comportement actuel
  (rétro-compat).
- Avec `issuerPrior` concentré : les codes de l'émetteur sont priorisés/filtrés ; avec un
  prior multi-codes : simple départage sans exclure un code légitime des mots.
- Émetteur immature (prior undefined) : aucun effet.
- `npx tsc --noEmit` et `npx vitest run` verts.
