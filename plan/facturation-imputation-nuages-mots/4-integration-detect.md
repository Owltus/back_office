# Étape 4 — Fusion nuages ↔ détection existante

## Objectif

Brancher le scoring des nuages dans `detect()` en **superposition** : la mémoire
d'émetteur (validation humaine) reste prioritaire ; les nuages fournissent la vraie
proba, la pré-sélection multi-label et les mots votants quand aucune règle apprise
ne tranche.

## Contexte

`detect(rawText, rules)` produit aujourd'hui `codes` (union des règles matchées) et
une `confidence` heuristique. On étend `Detection` (additif) et on remplace la
confiance par une vraie proba issue des nuages. D5 : le nom d'émetteur devient un
token fort du pool → un seul système d'apprentissage (plus de localStorage).

## Fichier(s) impacté(s)

- `src/lib/facturation/types.ts` (modification : champs additifs sur `Detection`, flag `learned` sur `InvoiceRecord`)
- `src/lib/facturation/detect.ts` (modification : signature + fusion)
- `src/lib/facturation/facturation.test.ts` (recalibrage — D8)

## Travail à réaliser

### 1. `types.ts` — additif

```ts
export interface Detection {
  supplier: string | null
  code: string | null
  codes: string[]
  matchedKeyword: string | null
  confidence: number
  learned: boolean
  hints: InvoiceHints
  // nuages :
  scores?: { code: string; proba: number; words: string[] }[]
  abstained?: boolean
}
// InvoiceRecord : garde d'idempotence de l'apprentissage
//   learned: boolean   (déjà un flag « appris au tamponnage »)
```

### 2. `detect.ts` — signature + fusion

```ts
export function detect(
  rawText: string,
  rules: SupplierRule[] = allRules(),
  pool?: WordPool,
): Detection {
  // 1) matching de règles existant (émetteur appris + seed keywords) → base
  //    (inchangé : codes des règles, en tête, prioritaires)
  // 2) si pool fourni : scoreInvoice(rawText, pool)
  const scored = pool ? scoreInvoice(rawText, pool) : []
  const abstained = pool ? abstains(scored) : false
  // 3) codes = union (règles prioritaires en tête) ∪ preselect(scored)
  // 4) confidence :
  //    - si une règle APPRISE (learned) tranche → confiance haute (vérité terrain)
  //    - sinon → proba du top1 des nuages (scored[0]?.proba ?? 0)
  //    - si abstained et aucune règle → confidence basse, codes = codes des règles seules
  return { /* ...base..., scores: scored.slice(0,5), abstained */ }
}
```

Règles de fusion (à respecter) :
- **Une règle apprise ne se dilue jamais** : si l'émetteur est reconnu, son/ses
  code(s) restent en tête et la confiance reste haute même si les nuages sont muets.
- Les nuages **ajoutent** des suggestions (codes au-dessus du seuil) et la proba.
- `abstained` vrai **seulement** si ni règle ni nuage ne tranchent → l'UI dira
  « preuve insuffisante ».

### 3. Recalibrage des tests (D8)

La proba n'a plus la distribution de l'ancienne heuristique. Ajuster les assertions
de `facturation.test.ts` (`confidence > 0.5`, `≥ 0.75`) : soit les baser sur la
présence d'une règle apprise (confiance haute conservée), soit assouplir les bornes.
Garder verts les tests existants de détection par règles (le chemin règles reste).

## Ordre d'exécution

1. `types.ts` (champs additifs).
2. `detect.ts` (paramètre `pool`, fusion, confiance).
3. Recalibrer `facturation.test.ts`.
4. `npx tsc --noEmit` + `npx vitest run src/lib/facturation`.

## Critère de validation

- Une règle apprise reconnue → codes en tête + confiance haute (non diluée).
- Sans règle mais pool informatif → codes pré-sélectionnés + vraie proba + mots votants.
- Ni règle ni pool → `abstained: true`.
- Tests recalibrés verts ; les tests de détection par règles ne régressent pas.
