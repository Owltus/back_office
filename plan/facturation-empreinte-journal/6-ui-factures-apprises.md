# Étape 6 — Section « Factures apprises » + désapprendre par hash

## Objectif

Exposer le journal dans le modal « Contrôle des imputations » : une liste des factures apprises pour
l'émetteur courant, chacune avec un bouton « Désapprendre » qui rejoue EXACTEMENT ses deltas (sans
re-déposer le PDF). Simplifier en conséquence le « Corriger une facture rejouée » (D3).

## Contexte

Diagnostic de l'agent UI : le modal est scopé émetteur (`issuerKey`) et sa machinerie par ligne
(`run(id, kind, fn)`, `useConfirm`) est réutilisable. Le désapprentissage par hash est EXACT (deltas
figés) → la confirmation peut être RASSURANTE (contrairement à `handleReplayUnlearn` qui doit
alarmer). Le journal peut grossir : filtrer par `issuerKey` le borne déjà ; trier par date
décroissante.

## Fichier(s) impacté(s)

- `src/components/facturation/useFacturationCuration.ts` (modif : `unlearnDocByHash`)
- `src/components/facturation/FacturationRevue.tsx` (modif : section « Factures apprises »)
- `src/components/facturation/InvoicePanel.tsx` (modif : repli replay conditionnel)

## Travail à réaliser

### 1. Action `unlearnDocByHash` (`useFacturationCuration.ts`)

Au patron des autres actions (RPC + patch cache) :

```ts
async function unlearnDocByHash(hash: string): Promise<void> {
  await forgetLearnedDoc(hash) // rejeu serveur des deltas + suppression de l'entrée
  // Retirer l'entrée du cache journal…
  queryClient.setQueryData<{ entries: JournalEntry[] }>(
    ['facturation', 'journal'],
    (old) => ({ entries: (old?.entries ?? []).filter((e) => e.hash !== hash) }),
  )
  // … et resynchroniser les modèles impactés (le serveur a décrémenté).
  queryClient.invalidateQueries({ queryKey: ['facturation', 'clouds'] })
  queryClient.invalidateQueries({ queryKey: ['facturation', 'issuers'] })
  queryClient.invalidateQueries({ queryKey: ['facturation', 'issuerCodes'] })
}
```

Ajouter au `return` du hook.

### 2. Section « Factures apprises » (`FacturationRevue.tsx`)

- Le modal lit déjà `useFacturationModel()` → ajouter `journal`. Calculer
  `docs = journal.entries.filter((e) => e.issuerKey === issuerKey).sort(par date décroissante)`.
- Nouvelle `<section>` dans le bloc `hasIssuer && !nothing`, sur le gabarit de la section
  « Associations apprises » : chaque ligne (nouveau `DocRow` calqué sur `AssocRow`) affiche la date,
  les codes (`budgetLabel`), l'empreinte courte (`hash.slice(0, 8)`), avec un bouton
  « Désapprendre » → `run(id, 'forget', () => unlearnDocByHash(hash))` précédé d'une confirmation
  RASSURANTE (« Retire exactement ce que cette facture avait appris. »).
- Étendre le type `Kind` et le compteur du sous-titre (« N factures apprises ») si pertinent.
- Prévoir une limite d'affichage (ex. 30 dernières) + « voir plus » si la liste est longue.

### 3. Repli du « Corriger une facture rejouée » (`InvoicePanel.tsx`) — D3

Le désapprentissage par hash rend `handleReplayUnlearn` inutile pour une facture journalisée. Régle :
- N'afficher le lien « Corriger une facture déjà tamponnée ? » que si la facture courante n'a PAS
  d'entrée dans le journal (`!journalHasHash(record.hash)`), c.-à-d. une facture apprise AVANT le
  journal. Sinon, un message renvoie vers « Contrôle des imputations → Factures apprises » pour le
  désapprentissage exact.

## Ordre d'exécution

1. `unlearnDocByHash` dans le hook.
2. Section « Factures apprises » + `DocRow` + confirmation.
3. Repli conditionnel du replay dans `InvoicePanel`.
4. `npx tsc --noEmit` + `npx vitest run` + `npx prettier --write` verts.

## Critère de validation

- Le modal liste les factures apprises de l'émetteur (date, codes, empreinte), triées récentes
  d'abord, bornées en nombre.
- « Désapprendre » sur une ligne retire l'entrée ET décrémente exactement les compteurs (via
  `forgetLearnedDoc`) — vérifié sur une facture de test.
- Le lien « Corriger une facture déjà tamponnée ? » n'apparaît plus pour une facture présente au
  journal (remplacé par le désapprentissage exact).
- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
