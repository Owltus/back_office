# Étape 1 — Apprentissage par émetteur (multi-imputations)

## Objectif

Permettre à l'utilisateur de saisir le nom de l'émetteur d'une facture et de
**mémoriser** l'association « nom → imputation(s) choisie(s) ». À la lecture d'un
prochain PDF contenant ce nom, `detect()` remonte les codes appris et
`processInvoice` les pré-sélectionne automatiquement dans `record.codes`.

## Contexte

La brique d'apprentissage existe déjà en lib (`detect.ts` : `rememberRule`,
`loadLearnedRules`, `allRules`, règles `learned` en `localStorage` sous la clé
`facturation:regles-apprises`) mais n'est **plus câblée à l'UI** (le champ
« Fournisseur » et le bouton « Mémoriser » ont été retirés lors du passage au
multi-codes). `rememberRule` ne gère qu'**un seul code** par appel ; une facture
porte désormais `codes: string[]`. On applique l'**option A** (D1) : une règle
apprise par code, même mot-clé — `detect()` reste inchangé (il agrège déjà via
`Set`).

## Fichier(s) impacté(s)

- `src/lib/facturation/types.ts` (modification : `InvoiceRecord.supplierName` réintroduit)
- `src/lib/facturation/detect.ts` (modification : `rememberRule` multi-codes + ids)
- `src/components/facturation/FacturationBoard.tsx` (modification : `supplierName` à la création + pré-remplissage)
- `src/components/facturation/InvoicePanel.tsx` (modification : champ + bouton)
- `src/lib/facturation/facturation.test.ts` (modification : test multi-codes appris)

## Travail à réaliser

### 1. `types.ts` — réintroduire le nom d'émetteur (D2, option A)

Ajouter le champ dans `InvoiceRecord` (le store le persiste en session) :

```ts
  codes: string[]
  supplierName: string
  comment: string
```

### 2. `detect.ts` — `rememberRule` multi-codes + garde-fou (D3)

Signature `rememberRule(supplier: string, codes: string[])`. Purger toutes les
règles apprises de cet émetteur (par `supplier` normalisé), puis émettre **une
règle par code** avec un id unique. Refuser un nom trop court.

```ts
export const MIN_LEARN_LEN = 4

/** Mémorise « émetteur → codes ». Remplace intégralement le set de l'émetteur.
 *  Retourne la liste à jour, ou l'existante si le nom est trop court. */
export function rememberRule(supplier: string, codes: string[]): SupplierRule[] {
  const key = normalize(supplier).trim()
  if (key.length < MIN_LEARN_LEN || codes.length === 0) return loadLearnedRules()
  const kept = loadLearnedRules().filter(
    (r) => normalize(r.supplier).trim() !== key,
  )
  const next: SupplierRule[] = [
    ...kept,
    ...codes.map((code) => ({
      id: `learned:${key}:${code}`,
      supplier: supplier.trim(),
      code,
      keywords: [key],
      learned: true,
    })),
  ]
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      /* quota / mode privé : ignoré */
    }
  }
  return next
}
```

`detect()`, `loadLearnedRules()`, `allRules()`, `forgetRule()` : **inchangés**
(l'agrégation par `Set` sur `codes` fait déjà le multi-code). Exposer aussi un
petit helper de confort si utile pour l'UI (facultatif) :

```ts
/** Vrai si un nom d'émetteur est mémorisable (assez long). */
export const canLearn = (supplier: string) =>
  normalize(supplier).trim().length >= MIN_LEARN_LEN
```

### 3. `FacturationBoard.tsx` — champ à la création + pré-remplissage

À la création du record, initialiser `supplierName: ''`. Dans `processInvoice`,
pré-remplir depuis la détection quand elle a trouvé un fournisseur (le mot-clé
matché est le meilleur candidat de nom déjà présent dans le PDF) :

```ts
    codes: d.codes,
    supplierName: d.supplier ? (d.matchedKeyword ?? '') : '',
    invoiceDate: d.hints.date ?? '',
```

### 4. `InvoicePanel.tsx` — champ « Émetteur » + bouton « Mémoriser »

Réintroduire, entre le bloc « Imputations comptables » et « Commentaire » :

- un `Input` lié à `record.supplierName` (`onPatch({ supplierName })`), placeholder
  « Nom de l'émetteur (ex. Martin) » ;
- un bouton « Mémoriser cet émetteur » sous les imputations, `disabled` tant que
  `!canLearn(record.supplierName)` ou `record.codes.length === 0`, avec un état
  local `remembered` remis à `false` à chaque frappe et un libellé de confirmation
  (`BookmarkPlus` → `Check`).

```tsx
const [remembered, setRemembered] = useState(false)
const canRemember = canLearn(record.supplierName) && record.codes.length > 0

function handleRemember() {
  rememberRule(record.supplierName, record.codes)
  setRemembered(true)
}
```

Imports à rétablir : `Input`, `rememberRule`/`canLearn` depuis `detect.ts`, icônes
`BookmarkPlus`, `Check`.

### 5. `facturation.test.ts` — apprentissage multi-codes

```ts
it('mémorise un émetteur → plusieurs codes, détectés au prochain texte', () => {
  const rules = rememberRule('Entreprise Martin', ['FMOBLIoooo', 'FMMATTECHo'])
  const d = detect('facture entreprise martin intervention', rules)
  expect(d.codes).toEqual(expect.arrayContaining(['FMOBLIoooo', 'FMMATTECHo']))
  expect(d.learned).toBe(true)
})

it('refuse un nom d’émetteur trop court', () => {
  expect(rememberRule('SA', ['FMOBLIoooo'])).toEqual([])
})
```

(Adapter : `rememberRule` écrit dans `localStorage` — en environnement Node de
vitest, `window` est absent, la fonction retourne la liste sans persister, ce qui
suffit au test puisqu'on lui repasse `rules` directement à `detect`.)

## Ordre d'exécution

1. `types.ts` (champ `supplierName`).
2. `detect.ts` (`rememberRule` multi-codes, `MIN_LEARN_LEN`, `canLearn`).
3. `FacturationBoard.tsx` (création + pré-remplissage).
4. `InvoicePanel.tsx` (champ + bouton).
5. `facturation.test.ts` (tests).
6. `npx tsc --noEmit` puis `npx vitest run src/lib/facturation`.

## Critère de validation

- Charger un PDF « Martin » inconnu → aucune pré-sélection ; saisir « Martin »,
  choisir 2 imputations, « Mémoriser ».
- Recharger un second PDF contenant « Martin » → les 2 imputations sont
  pré-sélectionnées automatiquement, la card indique « appris » (confiance ≥ 75 %).
- Un nom < 4 caractères ne peut pas être mémorisé (bouton désactivé).
- `tsc` + tests verts.
