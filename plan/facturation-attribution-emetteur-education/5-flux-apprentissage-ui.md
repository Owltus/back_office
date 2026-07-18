# Étape 5 — Flux d'apprentissage + UI + galaxie

## Objectif

Câbler le modèle émetteur→codes de bout en bout : charger le cache, résoudre l'émetteur
AVANT la détection et transmettre le prior, apprendre la co-occurrence au tamponnage,
gérer le désapprentissage, et afficher l'origine de la suggestion (émetteur vs mots).

Décision **D4** : `addStrong` (injection du nom d'émetteur dans le pull) est CONSERVÉ →
le modèle émetteur→codes est purement ADDITIF, et la galaxie reste INCHANGÉE.

## Contexte

Diagnostic frontend : `handleStamp` apprend aujourd'hui les nuages (`learnClouds`) + le
dictionnaire émetteur (`learnIssuer`) mais PAS la co-occurrence émetteur→codes. La détection
(`processInvoice`, `redetect`) ne reçoit pas l'émetteur — et `processInvoice` détecte AVANT
de résoudre `supplierName`, donc il faut réordonner (résoudre `matchIssuer` avant `detect`).
`addStrong` est CONSERVÉ (D4) → la galaxie n'est PAS touchée (elle garde ses nœuds émetteur).

## Fichier(s) impacté(s)

- `src/components/facturation/useFacturationModel.ts` (3e query `issuerCodes`)
- `src/components/facturation/FacturationBoard.tsx` (résolution émetteur → prior → detect/redetect)
- `src/components/facturation/InvoicePanel.tsx` (apprentissage/désapprentissage co-occurrence ; addStrong gardé)
- `src/components/facturation/confidence.ts` (badge source)

## Travail à réaliser

### 1. Chargement du modèle

- `useFacturationModel` : ajouter `useQuery(['facturation','issuerCodes'], fetchIssuerCodes)`
  (défaut `{ perIssuer: {} }`, `retry:false`, dégradation gracieuse). Renvoyer `issuerCodes`.

### 2. Résolution émetteur avant détection (FacturationBoard)

- Dans `processInvoice` : résoudre l'émetteur (`matchIssuer` / `record.supplierName`) AVANT
  `detect`, calculer `issuerPrior(model, key)` seulement si `issuerMaturity(...).strong`,
  puis `detect(text, undefined, pool, prior)`.
- `useEffect` de re-détection en séance : passer le même prior à `redetect` (sinon
  incohérence 1er passage / re-détection).

### 3. Apprentissage de la co-occurrence au tamponnage (InvoicePanel.handleStamp)

- Dans le bloc d'apprentissage (après `learnClouds`), ajouter `learnIssuerCodes(name,
  record.codes)` + patch optimiste du cache `['facturation','issuerCodes']` via
  `mergeIssuerCodes`.
- `handleUndoLearn` : ajouter `unlearnIssuerCodes(name, record.codes)` + invalidation du
  cache `issuerCodes`.
- `addStrong(SUPPLIER_WEIGHT)` reste INCHANGÉ (D4) : l'apprentissage émetteur→codes s'ajoute
  à côté, sans retirer l'injection existante dans le pull.

### 4. Affichage de l'origine (confidence.ts + ImputationList)

- `probaFor`/`ImputationList` : afficher un badge discret quand `source === 'issuer'`
  (« via émetteur ») pour que l'utilisateur comprenne d'où vient la suggestion.

Note : `galaxy.ts` n'est PAS modifié (D4 : `addStrong` conservé → la galaxie garde ses
nœuds/liens émetteur reconstruits depuis les tokens du pool).

## Ordre d'exécution

1. `useFacturationModel` (query issuerCodes) → `FacturationBoard` (prior → detect/redetect).
2. `InvoicePanel` (apprentissage + désapprentissage co-occurrence ; addStrong conservé).
3. `confidence.ts` (badge source).
4. `npx tsc --noEmit` puis `npx vitest run src/lib/facturation` + `pnpm build`.

## Critère de validation

- Un 2e dépôt du même émetteur (après tamponnage d'un 1er) profite du prior sans refresh.
- Le tamponnage écrit la co-occurrence (RPC) ; l'undo la décrémente ; cohérence cache/serveur.
- La galaxie fonctionne comme avant (inchangée).
- Émetteur inconnu / base immature : comportement identique à aujourd'hui (mots seuls).
- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
