# Étape 1 — Helper cycle métier (02h) porté en Deno

## Objectif

Donner aux Edge Functions la notion de « jour hôtelier » (bascule 02h00), pour
caler la récence et l'unicité d'envoi sur le cycle 2h→2h et non sur minuit.

## Contexte

`src/lib/businessDay.ts` (client) définit `DAY_CUTOFF_HOUR=2`, `businessNow`,
`businessDateStr`. Les Edge Functions Deno ne peuvent pas l'importer (`#/` alias
indisponible) → copie conforme dans `_shared`.

## Fichier(s) impacté(s)

- `supabase/functions/_shared/businessDay.ts` (nouveau)

## Travail à réaliser

Recopier fidèlement la logique client, en TZ Europe/Paris. Comme le runtime Edge
tourne en UTC, calculer le décalage Paris explicitement (pas `getHours()` local).

```ts
// _shared/businessDay.ts
export const DAY_CUTOFF_HOUR = 2

/** 'YYYY-MM-DD' du jour hôtelier courant (Europe/Paris, bascule 02h00). */
export function businessDateStr(now: Date = new Date()): string {
  // Heure Paris courante (gère l'heure d'été via Intl), puis - DAY_CUTOFF_HOUR.
  const paris = new Date(
    now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }),
  )
  paris.setHours(paris.getHours() - DAY_CUTOFF_HOUR)
  const m = String(paris.getMonth() + 1).padStart(2, '0')
  const d = String(paris.getDate()).padStart(2, '0')
  return `${paris.getFullYear()}-${m}-${d}`
}
```

## Ordre d'exécution

1. Créer le fichier.
2. `deno check --node-modules-dir=auto` sur un module qui l'importe (étape 3/4).

## Critère de validation

- `deno check` passe.
- Un petit smoke : `businessDateStr(new Date('2026-08-08T00:30:00Z'))` (00h30 Paris
  = 02h30 été → après cutoff ? non : 00h30 Paris → -2h = 22h30 la veille) renvoie
  bien la date de la VEILLE avant 02h Paris, et le jour courant après 02h.
