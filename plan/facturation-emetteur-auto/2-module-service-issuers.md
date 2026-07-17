# Étape 2 — Module `issuers.ts` (pur) + service

## Objectif

Logique pure de reconnaissance d'un émetteur connu dans un texte, plus les accès
Supabase (lecture du dictionnaire, apprentissage delta).

## Fichier(s) impacté(s)

- `src/lib/facturation/issuers.ts` (nouveau)
- `src/lib/facturation/cloudService.ts` (modification : fetchIssuers / learnIssuer)
- `src/lib/facturation/facturation.test.ts` (tests)

## Travail à réaliser

### 1. `issuers.ts` — matching pur

```ts
import { normalize } from '#/lib/facturation/text.ts'

export interface Issuer {
  name: string // nom normalisé (clé)
  display: string // nom lisible à afficher
  count: number
}

/** Émetteur connu présent dans le texte (sous-chaîne, nom ≥ 4 car.), le plus
 *  confirmé d'abord. null si aucun. */
export function matchIssuer(rawText: string, issuers: Issuer[]): Issuer | null {
  const text = normalize(rawText)
  let best: Issuer | null = null
  for (const it of issuers) {
    if (it.name.length < 4 || !text.includes(it.name)) continue
    if (
      !best ||
      it.count > best.count ||
      (it.count === best.count && it.name.length > best.name.length)
    )
      best = it
  }
  return best
}
```

### 2. `cloudService.ts` — fetch + learn

```ts
export async function fetchIssuers(): Promise<Issuer[]> {
  const { data, error } = await supabase
    .from('facturation_issuers')
    .select('name, display, count')
  if (error) throw error
  return (data ?? []) as Issuer[]
}

export async function learnIssuer(name: string, display: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_issuer_learn', {
    p_name: name,
    p_display: display,
  })
  if (error) throw error
}
```

(Le dictionnaire est petit → pas de pagination.)

### 3. Tests

```ts
it('reconnaît un émetteur connu par sous-chaîne', () => {
  const list = [{ name: 'martin', display: 'Entreprise Martin', count: 3 }]
  expect(matchIssuer('facture martin sarl', list)?.display).toBe('Entreprise Martin')
})
it('retourne null si aucun émetteur connu', () => {
  expect(matchIssuer('facture dupont', [{ name: 'martin', display: 'M', count: 1 }])).toBeNull()
})
it('préfère l’émetteur le plus confirmé', () => {
  const list = [
    { name: 'martin', display: 'A', count: 1 },
    { name: 'martins', display: 'B', count: 9 },
  ]
  expect(matchIssuer('facture martins', list)?.display).toBe('B')
})
```

## Ordre d'exécution

1. `issuers.ts`, 2. service, 3. tests, 4. `npx tsc --noEmit` + `npx vitest run src/lib/facturation`.

## Critère de validation

- Module pur (aucun React/DOM/Supabase), testé en Node.
- fetch/learn suivent le patron du repo (`{data,error}` → throw ; `.rpc` pour l'écriture).
