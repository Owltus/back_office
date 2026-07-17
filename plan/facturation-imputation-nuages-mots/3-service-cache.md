# Étape 3 — Service Supabase + lecture cachée + graine additive

## Objectif

Charger le modèle de nuages depuis Supabase **une seule fois par session** (cache
TanStack Query), le fusionner avec la graine client, et le rendre disponible au
scoring — sans recharger à chaque facture.

## Contexte

Patron du repo : un `service.ts` (mappers + `{data,error}`) + `useQuery` dans le
board (cf. `['affiche','templates']`). `processInvoice` est hors composant → il faut
lui **passer** le modèle (pas d'appel `useQuery` dedans). Dégradation gracieuse :
si la table n'existe pas encore / erreur réseau, on retombe sur la seule graine.

## Fichier(s) impacté(s)

- `src/lib/facturation/cloudService.ts` (nouveau)
- `src/components/facturation/FacturationBoard.tsx` (modification : useQuery + passage du modèle)

## Travail à réaliser

### 1. `cloudService.ts` — lecture + apprentissage

```ts
import { supabase } from '#/lib/supabase.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'

const TABLE = 'facturation_wordpool'

/** Lit tout le modèle (lignes (code,token,count)) → WordPool. Pagination .range
 *  pour dépasser 1000 lignes. Erreur → propagée (le board retombe sur la graine). */
export async function fetchClouds(): Promise<WordPool> {
  const perCode: WordPool['perCode'] = {}
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('code, token, count')
      .range(from, from + 999)
    if (error) throw error
    for (const r of data ?? []) {
      ;(perCode[r.code] ??= {})[r.token] = r.count
    }
    if (!data || data.length < 1000) break
    from += 1000
  }
  return { perCode }
}

/** Apprentissage delta via RPC serveur (atomique, garde interne). */
export async function learnClouds(codes: string[], deltas: Record<string, number>) {
  const { error } = await supabase.rpc('facturation_wordpool_learn', {
    p_codes: codes,
    p_deltas: deltas,
  })
  if (error) throw error
}
```

### 2. `FacturationBoard.tsx` — lecture cachée + fusion graine

```tsx
const { data: serverPool } = useQuery({
  queryKey: ['facturation', 'clouds'],
  queryFn: fetchClouds,
  // dégradation gracieuse : en échec, on garde la graine seule
})
// modèle effectif = graine (toujours) + serveur (si dispo), mémoïsé
const pool = useMemo(
  () => mergePools(seedPool(), serverPool ?? { perCode: {} }),
  [serverPool],
)
```

Passer `pool` au scoring. Comme `processInvoice` est module-level, deux voies (D du
rapport intégration) :
- **(a) recommandé** : déplacer l'appel du scoring dans `addFiles` (dans le
  composant, accès à `pool`) OU passer `pool` en argument à `processInvoice(record, pool)`.
- (b) lire le cache impérativement via `queryClient.getQueryData(['facturation','clouds'])`.

Retenir (a) : `processInvoice(record, pool)` reçoit le modèle en paramètre.

### 3. Course au démarrage à froid

Si une facture est chargée **avant** l'arrivée de `serverPool`, elle est scorée avec
la graine seule (acceptable). Optionnel : re-scorer les factures `ready` quand
`serverPool` arrive (effet sur `[serverPool]`). À implémenter seulement si gênant.

## Ordre d'exécution

1. `cloudService.ts`.
2. Board : `useQuery` + `mergePools(seedPool(), serverPool)` + passage à `processInvoice`.
3. `npx tsc --noEmit`.

## Critère de validation

- Le modèle est lu **une fois** (staleTime 60 s) — ouvrir 10 factures ne relit pas 10×.
- Table absente / hors-ligne → l'app fonctionne sur la graine (aucune erreur bloquante).
- `pool` est bien passé au scoring (pas d'appel réseau par facture).
