# Étape 1 — Module hash pur + type `JournalEntry`

## Objectif

Poser les fondations métier pures : un module `hash.ts` (empreinte SHA-256, 100 % navigateur) et
le type d'une entrée de journal, tous deux testables sans React ni Supabase.

## Contexte

Diagnostic de l'agent métier : aucune primitive SHA-256 n'existe (seul `galaxy.ts` a un FNV-1a de
jitter visuel, sans rapport). `crypto.subtle.digest('SHA-256', …)` est disponible en navigateur et
suffit — pas de dépendance. Le texte natif de `extractPdf` est déterministe ; l'OCR ne l'est pas
(d'où D1). Le type d'entrée doit refléter l'INSTANTANÉ figé au tampon (`learnedCodes`/`learnedIssuer`)
+ les `deltas` pour un rejeu exact.

## Fichier(s) impacté(s)

- `src/lib/facturation/hash.ts` (nouveau, pur)
- `src/lib/facturation/types.ts` (modif : + `JournalEntry`)
- `src/lib/facturation/facturation.test.ts` (modif : tests hash)

## Travail à réaliser

### 1. Module `hash.ts`

```ts
// hash.ts — empreinte SHA-256 d'un document, 100 % navigateur, pur (aucun React/Supabase).
import { normalize } from '#/lib/facturation/text.ts'
import type { ExtractMethod } from '#/lib/facturation/types.ts'

async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Hash du TEXTE extrait (stable pour un PDF natif ; normalisé pour absorber casse/accents). */
export const hashText = (text: string): Promise<string> =>
  sha256Hex(new TextEncoder().encode(normalize(text)))

/** Hash des OCTETS du fichier (identité robuste, indépendante de l'extraction). */
export const hashBytes = (buf: ArrayBuffer): Promise<string> => sha256Hex(buf)

/** Empreinte d'un document selon D1 : natif → texte, OCR → octets. */
export async function hashDocument(
  method: ExtractMethod,
  text: string,
  file: File,
): Promise<string> {
  return method === 'native' ? hashText(text) : hashBytes(await file.arrayBuffer())
}
```

### 2. Type `JournalEntry` dans `types.ts`

À placer près d'`InvoiceRecord`. Reflète l'instantané figé au tampon.

```ts
/** Une entrée du JOURNAL D'APPRENTISSAGE : ce qu'un PDF (identifié par son `hash`) a appris,
 *  figé au tampon, pour pouvoir le désapprendre EXACTEMENT plus tard sans re-déposer le PDF. */
export interface JournalEntry {
  hash: string                     // SHA-256 hex (texte normalisé si natif, octets si OCR)
  issuerKey: string | null         // clé canonique apprise (= learnedIssuer), ou null
  codes: string[]                  // = learnedCodes (instantané figé au tampon)
  deltas: Record<string, number>   // = countTokens(text) figé → rejeu exact de unlearnClouds
  method: ExtractMethod            // 'native' | 'ocr' — trace la fiabilité du hash (D1)
  learnedAt: string                // ISO date (record.processedDate)
}
```

Le cache journal sera un `{ entries: JournalEntry[] }` (miroir des autres modèles, ex.
`WordPool`, `IssuerCodes`).

### 3. Tests purs (`facturation.test.ts`)

- `hashText` est déterministe : `hashText('ABC')` === `hashText('abc')` (via `normalize`), et
  longueur 64 hex.
- `hashText('a')` !== `hashText('b')`.
- (Optionnel) `hashBytes` déterministe sur un `ArrayBuffer` fixe. `crypto.subtle` est dispo dans
  l'environnement de test (Node ≥ 20 / jsdom) — sinon marquer le test `skip` avec justification.

## Ordre d'exécution

1. Créer `hash.ts`.
2. Ajouter `JournalEntry` à `types.ts`.
3. Ajouter les tests hash.
4. `npx tsc --noEmit` et `npx vitest run src/lib/facturation` verts.

## Critère de validation

- `hash.ts` est pur (aucun import React/Supabase), `hashText` normalisé et déterministe.
- `JournalEntry` compile et reflète l'instantané (`codes`/`issuerKey`/`deltas`).
- `npx tsc --noEmit`, `npx vitest run src/lib/facturation` verts.
