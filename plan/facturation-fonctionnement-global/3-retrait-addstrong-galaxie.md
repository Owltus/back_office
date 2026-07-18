# Étape 3 — Retrait de `addStrong` + galaxie sur `IssuerCodes`

## Objectif

Cesser d'injecter le nom d'émetteur dans le pull de mots (`addStrong`) — plus gros gain de
propreté des nuages — maintenant que le signal émetteur vit dans le modèle séparé
`IssuerCodes`. Recâbler la galaxie pour qu'elle garde ses nœuds/liens émetteur.

## Contexte

Diagnostic des agents : `addStrong(SUPPLIER_WEIGHT=2)` (appelé au tamponnage et au
désapprentissage dans `InvoicePanel`) injecte les tokens du nom d'émetteur dans CHAQUE code
retenu. Ce nom (marque à idf élevé) gonfle le cosinus et tend à écraser les autres codes.
MAIS la galaxie (`buildGalaxy`) dérive ses nœuds émetteur en matchant les tokens du pool
contre le dictionnaire d'émetteurs → retirer `addStrong` appauvrit/supprime ces nœuds. C'est
le REVIREMENT de la décision D4 (voir Angles à clarifier).

## Fichier(s) impacté(s)

- `src/components/facturation/InvoicePanel.tsx` (retrait des appels `addStrong`)
- `src/lib/facturation/wordpool.ts` (`addStrong`/`SUPPLIER_WEIGHT` si plus utilisés)
- `src/lib/facturation/galaxy.ts` (nœuds émetteur depuis `IssuerCodes`)
- `src/lib/facturation/facturation.test.ts` (tests `buildGalaxy`)

## Travail à réaliser

### 1. Retrait de `addStrong`

- `InvoicePanel.tsx` : dans `handleStamp` et `handleUndoLearn`, retirer
  `addStrong(deltas, tokenize(record.supplierName), SUPPLIER_WEIGHT)`. Le delta appris ne
  contient plus que les mots du corps (`countTokens(record.text)`). Le signal émetteur passe
  par `learnIssuerCodes`/`unlearnIssuerCodes` (déjà en place).
- `wordpool.ts` : retirer `addStrong` et `SUPPLIER_WEIGHT` si plus référencés.

### 2. Galaxie alimentée par `IssuerCodes`

- `buildGalaxy(pool, issuers, …)` reçoit désormais aussi `issuerCodes`. Construire les
  nœuds/liens « émetteur → code » depuis `IssuerCodes.perIssuer` (poids = count), au lieu de
  deviner via les tokens du pool. Les nœuds émetteur ne dépendent plus de la présence
  fortuite du nom dans le nuage.
- Répercuter le nouvel argument dans `FacturationGalaxie` / `GalaxyCard` (qui appellent
  `buildGalaxy`) — `issuerCodes` est déjà exposé par `useFacturationModel`.

### 3. Tests

- Adapter les tests `buildGalaxy` : les liens émetteur→code proviennent maintenant de
  `issuerCodes` (fixture explicite) et non plus des tokens du pool.

## Ordre d'exécution

1. Retrait `addStrong` (`InvoicePanel`, `wordpool`).
2. Recâblage `buildGalaxy` sur `IssuerCodes` + appelants.
3. Tests galaxie adaptés. `npx tsc --noEmit` puis `npx vitest run` + `pnpm build`.

## Critère de validation

- Le nom d'émetteur n'apparaît plus dans les nuages de mots (nuages = contenu métier seul).
- La galaxie affiche toujours les liens émetteur→code (désormais depuis `IssuerCodes`).
- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
