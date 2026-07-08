# Étape 4 — Récap mensuel ELIOR : données + vue jour-par-jour + export

## Objectif

Produire le **récap du mois** pour la facture ELIOR : pour chaque jour du mois, le
nombre de **chambres nettoyées** (facturable), plus le **total du mois**, dans une
vue jour-par-jour, **exportable**.

## Contexte

ELIOR facture les **nettoyées** uniquement. Les nettoyées sont **stockées** dans
`rapro_rooms` (`status='nettoyee'`) → une requête par plage de dates suffit
(`rapro_rooms` n'a que `report_date`, pas de colonnes year/month, donc filtre
`.gte/.lte` façon `src/lib/caisse/service.ts` — pas le `.eq('year'/'month')` de
repjour). La mise en forme « chaque jour du mois + trous » reprend le patron
`fetchUnifiedDays` (`src/lib/repjour/services/data.ts`, `new Date(year, month, 0).
getDate()`). La vue reprend le patron mensuel de `analytique` (route + tableau
jour-par-jour `AnalytiqueMoisBoard.tsx`, `<table>` HTML + `tabular-nums`).

Décision applicable : **D3** (export CSV recommandé — à créer ; sinon PDF).

## Fichier(s) impacté(s)

- `src/lib/rapro/monthly.ts` (nouveau — requête + agrégation)
- `src/lib/rapro/pdf.ts` (modifié — `printRaproMonthly`, harnais d'impression réutilisé)
- `src/components/rapro/RaproMonthlyBoard.tsx` (nouveau — vue)
- `src/routes/rapro.mois.tsx` (nouveau — route, `ssr:false`) + `pnpm generate-routes`

## Travail à réaliser

### 1. Données mensuelles (monthly.ts)

```ts
// Nettoyees par jour sur [premierJour, dernierJour] (inclus).
export async function fetchCleanedByRange(
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('rapro_rooms')
    .select('report_date')
    .eq('status', 'nettoyee')
    .gte('report_date', from)
    .lte('report_date', to)
  if (error) throw error
  const byDay = new Map<string, number>()
  for (const r of data ?? []) {
    byDay.set(r.report_date, (byDay.get(r.report_date) ?? 0) + 1)
  }
  return byDay
}

// Chaque jour du mois (1..N) + total, trous a 0.
export function monthlyRows(year: number, month: number, byDay: Map<string, number>) {
  const days = new Date(year, month, 0).getDate()
  const rows = []
  let total = 0
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const cleaned = byDay.get(date) ?? 0
    total += cleaned
    rows.push({ date, day: d, cleaned })
  }
  return { rows, total }
}
```

### 2. Export PDF (pdf.ts — `printRaproMonthly`) — D3 = PDF

Réutiliser le harnais d'impression de `printRaproSheet` (`import('jspdf')`
dynamique + `autoPrint` + iframe caché, cf. `pdf.ts`). Ajouter une fonction
`printRaproMonthly(data, title)` qui dessine un **tableau mensuel** : une ligne par
jour (`date`, `nettoyées`) + une ligne **Total du mois**. Pour éviter une 3e copie
du harnais (déjà dupliqué caisse↔rapro), extraire un petit helper interne
`openPrintablePdf(pdf, frameId)` dans `pdf.ts` et l'appeler depuis les deux
fonctions rapro. En-tête : « RÉCAP MÉNAGE — <mois année> · ELIOR ».

### 3. Vue + route

- `RaproMonthlyBoard.tsx` : navigation par mois (précédent / suivant + libellé,
  state `year`/`month`), `useQuery(['rapro','monthly',year,month], () =>
  fetchCleanedByRange(premier, dernier))`, tableau jour-par-jour (`date`,
  `nettoyées`) + ligne **Total du mois**, bouton **Exporter**. Bornes de
  navigation cohérentes avec l'historique dispo.
- `src/routes/rapro.mois.tsx` : `ssr:false` (comme `/rapro`), garde d'accès,
  rend `<RaproMonthlyBoard />`. `pnpm generate-routes` ensuite.

## Ordre d'exécution

1. `monthly.ts` (`fetchCleanedByRange`, `monthlyRows`).
2. `printRaproMonthly` dans `pdf.ts` (+ extraction du helper `openPrintablePdf`).
3. `RaproMonthlyBoard.tsx` + `routes/rapro.mois.tsx` + `pnpm generate-routes`.
4. `npx tsc --noEmit` puis `pnpm build`.

## Critère de validation

- La vue mois affiche le nombre de nettoyées par jour + le total du mois (trous à 0).
- Le total = somme des nettoyées du mois ; une bloquée nettoyée un autre jour compte le bon jour (pas de double comptage).
- L'export ouvre un PDF imprimable du récap (jour par jour + total), en-tête ELIOR.
- Navigation entre mois OK, bornée à l'historique disponible.
- `npx tsc --noEmit` et `pnpm build` verts.
