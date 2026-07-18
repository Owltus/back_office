# Étape 1 — Filtre émetteur prudent + badge « à vérifier »

## Objectif

Appliquer les décisions de l'utilisateur : l'émetteur assiste sans jamais faire autorité.
Relever le seuil d'activation, retirer le filtre dur (les mots priment), et signaler
clairement quand une imputation vient du SEUL émetteur (mots muets) via un badge
« à vérifier ».

## Contexte

Diagnostic des agents : le filtre émetteur est déjà doux (re-pondération `EPS_PRIOR + prior`
puis tri par proba), sauf un filtre DUR quand l'émetteur est « concentré ». Le cas
mots-muets propose déjà le code habituel, mais sans marqueur. Le `source` par-code ne couvre
pas ce cas (les codes viennent de `topPriorCodes`, pas de `scores`) → il faut un flag au
niveau `Detection` (D3, option A).

## Fichier(s) impacté(s)

- `src/lib/facturation/issuerCodes.ts` (`ISSUER_STRONG_MIN`)
- `src/lib/facturation/detect.ts` (retrait filtre dur, flag)
- `src/lib/facturation/types.ts` (`Detection.fromIssuerOnly`)
- `src/components/facturation/confidence.ts` (helper `needsReview`)
- `src/components/facturation/InvoicePanel.tsx` (badge)
- `src/lib/facturation/facturation.test.ts`

## Travail à réaliser

### 1. Seuil 3 → 5

- `issuerCodes.ts` : `ISSUER_STRONG_MIN = 5`. Seul point ; consommé par `issuerMaturity`.

### 2. Retrait du filtre dur (les mots priment)

- `detect.ts` : dans la branche `if (!wordsAbstain)`, SUPPRIMER le sous-bloc
  `if (issuer?.concentrated) { const kept = codes.filter(prior>0); if (kept.length) codes = kept }`.
- CONSERVER la branche `else if (issuer?.concentrated) → topPriorCodes` (cas mots muets).
- La re-pondération/départage (`weighted` + `preselect`) reste intacte.

### 3. Flag « à vérifier »

```ts
// types.ts — interface Detection
/** Imputation issue du SEUL prior émetteur (mots muets) : proposée par habitude, à confirmer. */
fromIssuerOnly?: boolean
```

- `detect.ts` : `const issuerOnly = wordsAbstain && !!issuer?.concentrated && codes.length > 0`,
  puis `fromIssuerOnly: issuerOnly` dans le return « nuages pilotent ». Ne pas le poser
  ailleurs (règle, ou mots qui votent).

### 4. Badge UI

- `confidence.ts` : `export function needsReview(d): boolean` = `!!d?.fromIssuerOnly`.
- `InvoicePanel.tsx` (`ImputationList`) : second badge après « via émetteur », teinte alerte
  (ex. `bg-amber-500/10 text-amber-600`), affiché si `needsReview(detection)`.

### 5. Tests

- Mettre à jour les commentaires du test `issuerMaturity` (« total 1 < 3 » → « < 5 »).
- Ajouter : `fromIssuerOnly === true` sur le cas mots-muets concentré ; un test vérifiant que,
  mots votant A&B + émetteur concentré sur B, **A reste présent** (plus juste re-trié).

## Ordre d'exécution

1. `issuerCodes.ts` (seuil).
2. `types.ts` + `detect.ts` (retrait filtre dur + flag).
3. `confidence.ts` + `InvoicePanel.tsx` (badge).
4. Tests. `npx tsc --noEmit` puis `npx vitest run src/lib/facturation`.

## Critère de validation

- Émetteur concentré + mots muets → propose son code, `fromIssuerOnly === true`, badge affiché.
- Mots votant A&B + émetteur concentré sur B → A n'est plus exclu (départage seul).
- Seuil 5 : un émetteur à < 5 confirmations n'a plus d'effet fort.
- `npx tsc --noEmit` et `npx vitest run` verts.
