# Étape 4 — Cache journal + hash au dépôt + détection de doublon

## Objectif

Mettre le journal en cache (5e `useQuery`), calculer le hash de chaque PDF au dépôt, et détecter un
doublon (hash déjà présent au journal) → signalé à l'utilisateur de façon non bloquante.

## Contexte

Diagnostic de l'agent UI : `processInvoice` est module-level et ne peut pas lire le cache — les
modèles lui sont passés en argument (comme `pool`, `issuers`, `issuerCodes`, `issuerDenylist`). Le
journal suivra le même chemin. Le hash se calcule dans `processInvoice` (le `File` + le texte y sont
disponibles après `extractPdf`). L'avertissement doit rester NON bloquant (re-tamponner un même PDF
est un choix légitime), mais le flag permet de sauter le réapprentissage à l'étape 5 (D4).

## Fichier(s) impacté(s)

- `src/components/facturation/useFacturationModel.ts` (modif : 5e query)
- `src/lib/facturation/types.ts` (modif : `InvoiceRecord` += `hash?`, `duplicate?`)
- `src/components/facturation/FacturationBoard.tsx` (modif : hash + doublon dans `processInvoice`)
- `src/components/facturation/InvoicePanel.tsx` (modif : bandeau doublon)
- `src/components/facturation/InvoiceList.tsx` (modif : badge « doublon » sur la vignette)

## Travail à réaliser

### 1. Cache journal (`useFacturationModel.ts`)

Ajouter une 5e `useQuery({ queryKey: ['facturation','journal'], queryFn: fetchJournal, retry:false })`,
l'ajouter au type de retour et à l'objet retourné : `journal: journal ?? { entries: [] }`. Pour un
accès O(1) au doublon, exposer aussi une `Set<string>` des hash ou laisser l'appelant l'indexer.

### 2. Champs `InvoiceRecord`

```ts
  /** Empreinte SHA-256 du document (cf. hashDocument) — calculée au dépôt. */
  hash?: string
  /** Vrai si ce hash est déjà présent au journal (déjà appris) → doublon signalé. */
  duplicate?: boolean
```

### 3. Hash + doublon dans `processInvoice` (`FacturationBoard.tsx`)

`processInvoice` reçoit un 5e argument (les hash connus du journal). Après `extractPdf` :

```ts
const res = await extractPdf(record.file)
const hash = await hashDocument(res.method, res.text, record.file)
const duplicate = knownHashes.has(hash)
// … detection existante …
patchInvoice(record.id, { /* … */, hash, duplicate })
```

Le composant transmet le journal comme les autres modèles :
`created.forEach((r) => processInvoice(r, pool, issuers, issuerCodes, issuerDenylist, knownHashes))`
où `knownHashes = new Set(journal.entries.map((e) => e.hash))`. Ne PAS ajouter le journal aux deps
de la re-détection en séance (`useEffect`) : le hash est stable, inutile de relancer la détection.

### 4. Signalements

- `InvoicePanel` : un bandeau non bloquant quand `record.duplicate` (au-dessus du bouton tampon) —
  « Cette facture a déjà été apprise. La re-tamponner ne réapprendra pas (évite le double
  comptage). » (le comportement « ne pas réapprendre » est implémenté à l'étape 5.)
- `InvoiceList` : petit badge « doublon » sur la vignette (comme le marqueur « Validé »), léger.

## Ordre d'exécution

1. `useFacturationModel.ts` : 5e query + retour.
2. `types.ts` : champs `hash`/`duplicate`.
3. `FacturationBoard.tsx` : hash + doublon dans `processInvoice` + transmission du `knownHashes`.
4. `InvoicePanel.tsx` + `InvoiceList.tsx` : signalements.
5. `npx tsc --noEmit` et `npx vitest run src/lib/facturation` verts.

## Critère de validation

- Le journal est lu en cache (dégradation gracieuse si table absente → journal vide, aucun doublon).
- Déposer un PDF calcule son hash ; re-déposer le même PDF (natif) le marque `duplicate` et affiche
  le bandeau + badge.
- La re-détection en séance n'est pas relancée par le journal.
- `npx tsc --noEmit`, `npx vitest run` verts.
