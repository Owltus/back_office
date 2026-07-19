# Étape 3 — Câblage board + stoplist depuis le journal

## Objectif

Calculer la stoplist adaptative depuis le journal (une seule fois, source unique) et la threader
jusqu'à la détection dans l'atelier (dépôt + re-détection en séance).

## Contexte

Diagnostic des agents : `documentStoplist` se calcule depuis `journal.entries` (dispo via
`useFacturationModel`). `processInvoice` est hors composant et reçoit déjà les modèles en
paramètres (`pool`, `issuers`, `issuerCodes`, `issuerDenylist`, `knownHashes`) → on ajoute `stop`.
La re-détection en séance (`useEffect`) doit passer la stoplist ET l'avoir en dépendance : le
`setQueryData(journal)` au tamponnage change `journal` → la stoplist se resserre → les factures
ouvertes non éditées se ré-imputent (le patch conditionnel `if (!same)` évite toute boucle).

## Fichier(s) impacté(s)

- `src/components/facturation/useFacturationModel.ts` (modif : expose la stoplist dérivée — source unique)
- `src/components/facturation/FacturationBoard.tsx` (modif : threading `stop`)

## Travail à réaliser

### 1. Source unique : exposer la stoplist depuis `useFacturationModel`

Pour éviter de recalculer la stoplist dans 3 composants (board, galaxie, revue), la dériver une
fois là où le journal est lu :

```ts
// useFacturationModel.ts — en plus du journal déjà exposé
const stoplist = useMemo(
  () => documentStoplist(journal?.entries ?? []),
  [journal],
)
return { /* … */, journal: journal ?? { entries: [] }, stoplist }
```

(Alternative : un hook dérivé `useFacturationStoplist()` lisant la même query. Choix à noter à
l'implémentation ; la source unique est l'important.)

### 2. Board : threader `stop` à la détection

- Destructurer `stoplist` de `useFacturationModel()`.
- `processInvoice(record, pool, issuers, issuerCodes, issuerDenylist, knownHashes, stop)` : ajouter
  le paramètre et le passer à `detect(res.text, undefined, pool, issuerHintFor(...), stop)`.
- Appel dans `addFiles` : ajouter `stoplist`.
- Re-détection en séance (`useEffect`) : `redetect(r.text, pool, issuerHintFor(...), stoplist)` +
  ajouter `stoplist` aux DEPS du `useEffect`.

## Ordre d'exécution

1. `useFacturationModel.ts` : dériver + exposer `stoplist`.
2. `FacturationBoard.tsx` : `processInvoice(+stop)`, appel `addFiles`, `redetect(+stop)` + deps.
3. `npx tsc --noEmit` + `npx vitest run` verts.

## Critère de validation

- Au dépôt et à la re-détection en séance, la stoplist adaptative est appliquée (les parasites du
  contexte ne votent plus une fois la base assez fournie).
- Aucune boucle de re-rendu (patch conditionnel `if (!same)` conservé).
- Dégradation gracieuse : journal vide → stoplist vide → détection identique à l'existant.
- `npx tsc --noEmit`, `npx vitest run` verts.
