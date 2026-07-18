# Étape 1 — Prévention émetteur

## Objectif

Empêcher qu'une faute de frappe sur le nom d'émetteur ne crée une entrée fantôme dans
le dictionnaire : autocomplétion depuis les émetteurs connus, suggestion « vouliez-vous
dire X ? » quand le nom saisi est proche d'un existant, et normalisation plus stricte de
la clé pour éviter les doublons d'orthographe.

## Contexte

Diagnostic des agents : l'input émetteur (`InvoicePanel.tsx`) est un `<Input>` libre ;
au tamponnage, `learnIssuer(name, display)` fait un upsert sur `name = normalize(...).trim()`.
`normalize` (text.ts) ne gère que casse + accents → « Booking » et « Bookng » sont deux
clés distinctes. `matchIssuer` (issuers.ts) est du sous-chaîne EXACT, aucune logique
floue. Les émetteurs connus sont déjà chargés (`useFacturationModel` → `issuers`) mais
**non transmis** à `InvoicePanel` (à corriger). C'est côté dictionnaire que la faute de
frappe est durable (pas de `cf<2`, pas de prune).

## Fichier(s) impacté(s)

- `src/lib/facturation/similarity.ts` (nouveau, pur)
- `src/lib/facturation/text.ts` (normalizeIssuer)
- `src/components/facturation/FacturationBoard.tsx` (transmet `issuers`)
- `src/components/facturation/InvoicePanel.tsx` (autocomplétion + suggestion fuzzy)

## Travail à réaliser

### 1. Module `similarity.ts` (métier pur)

Distance d'édition (Levenshtein) + ratio de similarité normalisé, testable.

```ts
export function levenshtein(a: string, b: string): number { /* DP classique */ }
/** 1 = identique, 0 = tout différent. */
export function similarity(a: string, b: string): number {
  const d = levenshtein(a, b)
  const m = Math.max(a.length, b.length)
  return m === 0 ? 1 : 1 - d / m
}
/** Meilleur candidat parmi `names` si assez proche (ratio >= seuil), sinon null. */
export function closestName(
  query: string,
  names: string[],
  minRatio = 0.85,
): string | null { /* ... */ }
```

### 2. `normalizeIssuer` (D4) dans `text.ts`

Sans alourdir `normalize` (partagé avec le scoring). Nouvelle fonction dédiée :
`normalize` puis collapse des espaces (`\s+ → ' '`), retrait de la ponctuation, et
retrait des suffixes juridiques finaux (`sarl`, `sas`, `sa`, `eurl`…). Sert de clé de
comparaison/dédup pour les émetteurs.

### 3. Transmettre `issuers` à `InvoicePanel`

Dans `FacturationBoard`, passer `issuers` (déjà dispo) en prop. Ajouter `issuers: Issuer[]`
à la signature d'`InvoicePanel`.

### 4. Autocomplétion (prévention passive)

Sur l'input émetteur, brancher un `<datalist>` alimenté par `issuers.map(i => i.display)`
(zéro dépendance nouvelle). Cohabite avec le pré-remplissage `matchIssuer` existant.

### 5. Suggestion « vouliez-vous dire X ? » (D3, prévention active)

À la saisie (onBlur) ou avant l'apprentissage : si `closestName(normalizeIssuer(saisi),
issuers.map(i => i.name))` renvoie un existant PROCHE mais NON identique, afficher sous
l'input un encart discret « Vouliez-vous dire **{display}** ? » cliquable → remplace
`supplierName` par le `display` canonique (`onPatch({ supplierName: display, userEdited: true })`).
Réutiliser `confidenceTone`/tokens du thème (encart `bg-muted/40 text-xs`). Ne rien
bloquer : suggestion, pas obstacle.

## Ordre d'exécution

1. `similarity.ts` + tests (levenshtein, similarity, closestName).
2. `normalizeIssuer` + tests (espaces, suffixes).
3. Prop `issuers` (board → panel).
4. `<datalist>` d'autocomplétion.
5. Encart « vouliez-vous dire » (fuzzy, non bloquant).

## Critère de validation

- Saisir un émetteur déjà connu → il apparaît en autocomplétion.
- Saisir une variante proche (« Bookng ») → suggestion « Vouliez-vous dire Booking ? », clic → snap au nom canonique.
- Deux saisies « Martin SA » / « martin sa » → même clé `normalizeIssuer`.
- `npx tsc --noEmit`, `npx vitest run` (nouveaux tests similarity/normalizeIssuer) passent.
