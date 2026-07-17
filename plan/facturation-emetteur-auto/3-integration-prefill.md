# Étape 3 — Lecture cachée + pré-remplissage + apprentissage

## Objectif

Charger le dictionnaire (caché), pré-remplir le champ Émetteur quand un émetteur
connu est reconnu, et apprendre l'émetteur au tamponnage.

## Fichier(s) impacté(s)

- `src/components/facturation/FacturationBoard.tsx` (modification)
- `src/components/facturation/InvoicePanel.tsx` (modification)

## Travail à réaliser

### 1. `FacturationBoard` — lecture + pré-remplissage

Ajouter une requête cachée symétrique aux nuages, et passer la liste à
`processInvoice` :

```tsx
const { data: issuers } = useQuery({
  queryKey: ['facturation', 'issuers'],
  queryFn: fetchIssuers,
  retry: false,
})
// ...
created.forEach((r) => processInvoice(r, pool, issuers ?? []))
```

Dans `processInvoice(record, pool, issuers)`, calculer le pré-remplissage :

```ts
const known = matchIssuer(res.text, issuers)
// priorité : émetteur appris > mot-clé d'une SEED_RULE > vide
supplierName: known?.display ?? (d.supplier ? (d.matchedKeyword ?? '') : ''),
```

Note démarrage à froid : si `issuers` arrive après une facture déjà chargée, le
champ reste vide (l'utilisateur tape → apprentissage). Acceptable.

### 2. `InvoicePanel` — apprendre l'émetteur au tamponnage

Dans `handleStamp`, après `learnClouds`, apprendre aussi l'émetteur (best-effort,
même garde `record.learned`) et patcher le cache des émetteurs :

```ts
if (canLearn(record.supplierName)) {
  const name = normalize(record.supplierName).trim()
  const display = record.supplierName.trim()
  try {
    await learnIssuer(name, display)
    queryClient.setQueryData<Issuer[]>(['facturation', 'issuers'], (old) => {
      const list = old ? [...old] : []
      const i = list.findIndex((x) => x.name === name)
      if (i >= 0) list[i] = { ...list[i], display, count: list[i].count + 1 }
      else list.push({ name, display, count: 1 })
      return list
    })
  } catch {
    /* best-effort */
  }
}
```

Imports : `normalize` (text.ts), `learnIssuer` (cloudService), `matchIssuer`/`Issuer`
(issuers.ts) côté board.

## Ordre d'exécution

1. Board : useQuery issuers + passage à processInvoice + pré-remplissage.
2. InvoicePanel : learnIssuer au tamponnage + patch cache.
3. `npx tsc --noEmit`.

## Critère de validation

- Un émetteur déjà appris et présent dans le texte → champ Émetteur pré-rempli.
- Émetteur inconnu → champ vide (pas de devinette).
- Au tamponnage, un `facturation_issuer_learn` part (une fois par facture).
- Sans table Supabase → aucun pré-remplissage, aucune erreur bloquante.
