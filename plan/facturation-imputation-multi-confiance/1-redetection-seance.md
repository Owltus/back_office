# Étape 1 — Re-détection en séance

## Objectif

Faire en sorte qu'après le tamponnage d'un PDF, les factures déjà déposées mais non
tamponnées soient **ré-imputées automatiquement** avec le pool fraîchement enrichi,
sans rafraîchir la page. Corrige le bug « le 2e PDF ne profite pas de l'apprentissage ».

## Contexte

Diagnostic confirmé par les agents DB, métier et frontend : le cache TanStack Query
EST bien mis à jour au tamponnage (patch optimiste `setQueryData` sur
`['facturation','clouds']` et `['facturation','issuers']`), et `pool` est recalculé
(`useMemo` dans `FacturationBoard`). **Mais** `detect()` n'est appelé qu'UNE fois par
facture, au dépôt (`processInvoice`), et le résultat est figé dans le store. Aucun
mécanisme ne ré-évalue les records existants quand `pool` change. `detect()` est une
fonction pure ré-appelable, et le texte est déjà stocké (`record.text`) : re-scorer ne
demande **aucune ré-extraction PDF**.

## Fichier(s) impacté(s)

- `src/lib/facturation/detect.ts`
- `src/lib/facturation/types.ts`
- `src/components/facturation/FacturationBoard.tsx`
- `src/components/facturation/InvoicePanel.tsx`

## Travail à réaliser

### 1. Fonction pure `redetect` (métier)

Ajouter dans `detect.ts` une fonction qui re-score un record **sans ré-extraire** le
PDF (contrairement à `processInvoice` qui lit le `File`). Elle réutilise `detect()`
avec le `pool` courant et renvoie les champs à patcher.

```ts
export function redetect(text: string, pool: WordPool): Pick<Detection, never> & {
  detection: Detection
  codes: string[]
} {
  const d = detect(text, undefined, pool)
  return { detection: d, codes: d.codes }
}
```

(Adapter la signature au type réel de `Detection`/`InvoiceRecord`. Conserver le 2e
paramètre `rules` à `undefined` pour ne pas changer le comportement de la couche 1.)

### 2. Flag `userEdited` sur le record (D6)

Dans `types.ts`, ajouter `userEdited?: boolean` à `InvoiceRecord`. Le positionner à
`true` dans `InvoicePanel` dès qu'une valeur est **patchée à la main** (codes via
`CodePicker`/retrait de pastille, `supplierName`, `invoiceDate`). But : la
re-détection ne doit jamais écraser une saisie humaine.

### 3. Effet de re-détection sur changement de pool (orchestration)

Dans `FacturationBoard`, ajouter un `useEffect([pool])` qui, pour chaque record
`status === 'ready'`, **non `learned`** et **non `userEdited`**, recalcule la détection
depuis `record.text` et patche le store :

```ts
useEffect(() => {
  for (const r of records) {
    if (r.status !== 'ready' || r.learned || r.userEdited || !r.text) continue
    const { detection, codes } = redetect(r.text, pool)
    patchInvoice(r.id, { detection, codes })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pool])
```

Garde-fou : ne dépendre que de `pool` (pas de `records`) pour éviter une boucle ;
`patchInvoice` ne doit modifier que si le résultat change réellement (comparer `codes`
avant de patcher, pour éviter des rendus inutiles).

### 4. Feedback d'apprentissage (D7)

Dans `InvoicePanel.handleStamp`, le `catch {}` avale les échecs RPC (rôle insuffisant,
table absente). Remonter un état minimal (ex. drapeau `learnError` sur le record, ou
un toast) pour que l'utilisateur sache que rien n'a été appris — sans casser la
dégradation gracieuse (le PDF reste tamponné/téléchargé quoi qu'il arrive).

## Ordre d'exécution

1. `redetect` dans `detect.ts` (+ test unitaire : même texte, pool enrichi → codes changent).
2. Flag `userEdited` dans `types.ts` + positionnement dans `InvoicePanel`.
3. Effet `useEffect([pool])` dans `FacturationBoard`.
4. Feedback d'échec d'apprentissage.

## Critère de validation

- Déposer 2 PDF « à froid », tamponner le 1er sur un code, **sans refresh** : le 2e voit sa détection changer si le pool l'influence.
- Un record dont l'imputation a été **modifiée à la main** n'est PAS écrasé par la re-détection.
- Aucun rendu en boucle (pas de re-détection si le résultat est identique).
- `npx tsc --noEmit` et `npx vitest run` passent (nouveau test `redetect`).
