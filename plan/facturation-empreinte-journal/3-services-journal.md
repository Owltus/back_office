# Étape 3 — Services : lecture + wrappers RPC du journal

## Objectif

Ajouter à `cloudService.ts` les accès au journal : lecture paginée (`fetchJournal`), enregistrement
(`recordLearnedDoc`) et désapprentissage par hash (`forgetLearnedDoc`), au patron uniforme du module.

## Contexte

Diagnostic de l'agent métier : toutes les écritures passent par `supabase.rpc(nom, {…}); if (error)
throw error`, et les lectures par une boucle `.range(from, from+999)`. Le journal s'y conforme à
l'identique. Les noms de RPC/table proviennent de l'étape 2 (`facturation_learned_docs`,
`_record`, `_forget`).

## Fichier(s) impacté(s)

- `src/lib/facturation/cloudService.ts` (modif : bloc journal)

## Travail à réaliser

### 1. Lecture paginée du journal

Calquée sur `fetchIssuerCodes`. Retourne un `{ entries: JournalEntry[] }`.

```ts
import type { JournalEntry } from '#/lib/facturation/types.ts'

const JOURNAL_TABLE = 'facturation_learned_docs'

/** Lit tout le journal d'apprentissage. Propage l'erreur (table absente → dégradation gérée
 *  par l'appelant : journal vide). */
export async function fetchJournal(): Promise<{ entries: JournalEntry[] }> {
  const entries: JournalEntry[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(JOURNAL_TABLE)
      .select('hash, issuer, codes, deltas, method, created_at')
      .range(from, from + 999)
    if (error) throw error
    const rows = (data ?? []) as {
      hash: string
      issuer: string | null
      codes: string[]
      deltas: Record<string, number>
      method: string
      created_at: string
    }[]
    for (const r of rows)
      entries.push({
        hash: r.hash,
        issuerKey: r.issuer,
        codes: r.codes ?? [],
        deltas: r.deltas ?? {},
        method: r.method === 'ocr' ? 'ocr' : 'native',
        learnedAt: r.created_at,
      })
    if (rows.length < 1000) break
    from += 1000
  }
  return { entries }
}
```

### 2. Écritures (RPC)

```ts
/** Enregistre un document appris (idempotent côté serveur : on conflict do nothing). */
export async function recordLearnedDoc(entry: JournalEntry): Promise<void> {
  const { error } = await supabase.rpc('facturation_learned_docs_record', {
    p_hash: entry.hash,
    p_issuer: entry.issuerKey ?? '',
    p_codes: entry.codes,
    p_deltas: entry.deltas,
    p_method: entry.method,
  })
  if (error) throw error
}

/** Désapprend EXACTEMENT le document `hash` (rejeu serveur des deltas) puis retire l'entrée. */
export async function forgetLearnedDoc(hash: string): Promise<void> {
  const { error } = await supabase.rpc('facturation_learned_docs_forget', {
    p_hash: hash,
  })
  if (error) throw error
}
```

## Ordre d'exécution

1. Ajouter le bloc journal à `cloudService.ts` (const + 3 fonctions).
2. `npx tsc --noEmit` vert.

## Critère de validation

- `fetchJournal` paginé, tolérant (propage l'erreur si table absente → l'appelant retombe sur
  journal vide). `recordLearnedDoc`/`forgetLearnedDoc` passent par `supabase.rpc` avec propagation
  d'erreur, au patron du module.
- `npx tsc --noEmit` vert.
