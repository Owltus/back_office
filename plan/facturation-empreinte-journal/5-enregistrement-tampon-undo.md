# Étape 5 — Enregistrement au tampon + undo + garde anti-doublon

## Objectif

Au tamponnage, écrire l'entrée de journal (best-effort) ; à l'annulation en séance, la retirer ; et
sauter le réapprentissage si le PDF est un doublon déjà appris (D4).

## Contexte

Diagnostic de l'agent UI : `handleStamp` fige déjà l'instantané (`learnedCodes`, `deltas`,
`learnedIssuer`) puis pose `onPatch({ learned:true, learnedCodes, learnedIssuer })`. Le journal doit
enregistrer EXACTEMENT cet instantané (+ `hash` + `method`). La garde anti-double-comptage
(`!record.learned`) ne voit pas un doublon re-déposé (nouvelle session → `learned:false`) : c'est le
journal (via `record.duplicate`) qui bloque le réapprentissage.

## Fichier(s) impacté(s)

- `src/components/facturation/InvoicePanel.tsx` (modif : `handleStamp`, `handleUndoLearn`)

## Travail à réaliser

### 1. Garde anti-doublon dans `handleStamp`

Le tampon + téléchargement se font TOUJOURS. L'apprentissage est SAUTÉ si le document est un doublon
déjà appris :

```ts
// Après stampAndDownload(...) et onPatch({ stamped: true })
const alreadyLearned = record.duplicate === true
if (!record.learned && !alreadyLearned && record.codes.length > 0) {
  // … apprentissage existant (learnClouds / learnIssuer / learnIssuerCodes + instantané) …
}
```

(Si `alreadyLearned`, le bandeau de l'étape 4 a déjà prévenu l'utilisateur.)

### 2. Enregistrement du journal au tampon

Juste après `onPatch({ learned: true, learnedCodes, learnedIssuer })`, dans le même `try`
best-effort (un échec ne bloque pas le PDF déjà tamponné) :

```ts
if (record.hash) {
  try {
    await recordLearnedDoc({
      hash: record.hash,
      issuerKey: learnedIssuer,
      codes: learnedCodes,
      deltas,
      method: record.method ?? 'native',
      learnedAt: record.processedDate,
    })
    queryClient.setQueryData<{ entries: JournalEntry[] }>(
      ['facturation', 'journal'],
      (old) => ({ entries: [...(old?.entries ?? []), /* la nouvelle entrée */] }),
    )
  } catch {
    // best-effort : le journal n'a pas pu être écrit (droits/table), l'apprentissage reste fait.
  }
}
```

### 3. Suppression du journal à l'annulation en séance

Dans `handleUndoLearn`, après le désapprentissage (`unlearnInvoiceCore`), retirer aussi l'entrée du
journal (le hash est sur `record`). Attention : `handleUndoLearn` décrémente déjà les nuages ; pour
éviter un DOUBLE décrément, on appelle `forgetLearnedDoc` **uniquement pour retirer l'entrée**, PAS
pour re-rejouer les deltas. Deux options :
- **A (recommandée)** : garder `unlearnInvoiceCore` (décrément) + un simple `delete` de l'entrée via
  une variante RPC « supprimer sans rejeu », OU un patch cache local + invalidation ; ne PAS appeler
  `forgetLearnedDoc` (qui rejouerait). Le plus simple : après `unlearnInvoiceCore`, retirer l'entrée
  du cache journal et laisser le serveur être resynchronisé à la prochaine lecture — mais la ligne
  serveur resterait. → prévoir une RPC légère `_delete(p_hash)` (sans rejeu) pour l'undo en séance.
- **B** : NE PAS décrémenter dans `handleUndoLearn` et déléguer à `forgetLearnedDoc(record.hash)`
  (rejeu + suppression, une seule source de vérité). Plus propre mais change le chemin de l'undo en
  séance. À arbitrer à l'implémentation (noter le choix).

Recommandation : **option B** — unifier l'undo en séance sur `forgetLearnedDoc(hash)` quand
`record.hash` existe (le journal fait foi), et ne retomber sur `unlearnInvoiceCore` que si pas de
hash (anciennes factures). Cela évite toute divergence journal ↔ compteurs.

## Ordre d'exécution

1. Garde `alreadyLearned` dans `handleStamp`.
2. Enregistrement `recordLearnedDoc` + patch cache après l'instantané.
3. Undo en séance : arbitrer A/B (recommandé B), retirer l'entrée du journal.
4. `npx tsc --noEmit` + `npx vitest run` verts.

## Critère de validation

- Tamponner une facture écrit une entrée de journal (hash, codes, émetteur, deltas, method).
- Re-tamponner un doublon télécharge le PDF mais NE réapprend PAS (pas de ré-incrément des nuages).
- « Annuler l'apprentissage » retire l'entrée du journal ET remet les compteurs sans double
  décrément (choix A/B documenté dans le code).
- `npx tsc --noEmit`, `npx vitest run` verts.
