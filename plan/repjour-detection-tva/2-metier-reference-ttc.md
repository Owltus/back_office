# Étape 2 — Référence TTC pour la détection forecast

## Objectif

Construire une référence TTC **fiable** à laquelle comparer un forecast, pour
savoir s'il est en TTC (correct) ou en HT (« Include Tax » oublié). La référence
vient du **réalisé UNIQUEMENT** (`daily_reports`, MTD, en TTC). Pas de repli
budget : un objectif annuel peut être ~10 % au-dessus/dessous du réel et
provoquerait de faux positifs. Si le réalisé manque (mois futur, début de mois) →
`null`, et on ne détecte pas (souple : on ne bloque jamais sans certitude).

## Contexte

Découverte sur données réelles (`doc/`) : dans le Comparison, `ROOM REVENUE` est
TOUJOURS en HT (le réglage « Include Tax » ne fait qu'ajouter/retirer les lignes
VAT, il ne change pas le revenu chambre). L'app le convertit en TTC (× 1,10), donc
le réalisé stocké (`daily_reports.rmtd_room_revenue`, `rmtd_nuitees`) est **fiable
par nature** et sert d'étalon. L'ADR réalisé MTD = `rmtd_room_revenue / rmtd_nuitees`.

Le Comparison n'a donc **pas besoin** de contrôle TVA propre (son revenu chambre
est toujours correct) : l'ancienne idée de « self-check Comparison » est abandonnée.

## Fichier(s) impacté(s)

- `src/lib/repjour/services/daily.ts` (helper de référence, éventuel)
- consommé par `import/orchestrator.ts` (étape 4) et `calc/validate.ts` (étape 3)

## Travail à réaliser

### 1. Helper « ADR de référence » (réalisé seul)

```ts
export interface TvaRef {
  adrTTC: number
}

/** Référence TTC d'un mois = ADR réalisé MTD (daily_reports), s'il couvre assez
 *  de jours. Sinon null → aucune détection TVA possible (mois futur, début de
 *  mois). Pas de repli budget (trop bruité). */
export function buildTvaRef(
  latestReport: DailyReport | null, // dernier jour importé du mois (rmtd_*)
): TvaRef | null {
  if (
    latestReport &&
    latestReport.rmtd_nuitees >= SEUIL_JOURS_REF &&
    latestReport.rmtd_room_revenue > 0
  ) {
    return { adrTTC: latestReport.rmtd_room_revenue / latestReport.rmtd_nuitees }
  }
  return null
}
```

`SEUIL_JOURS_REF` : quelques jours réalisés minimum pour que le MTD ne soit pas
bruité (à caler ; l'ADR d'un seul jour est trop volatil).

### 2. Lecture du dernier réalisé du mois

Réutiliser `fetchLatestReportOfMonth(year, month)` (déjà présent dans
`services/daily.ts`) — renvoie le jour le plus récent, porteur des `rmtd_*`.

## Ordre d'exécution

1. Ajouter `TvaRef` + `buildTvaRef` (dans `daily.ts` ou un module métier dédié).
2. `npx tsc --noEmit`.

## Critère de validation

- `buildTvaRef` renvoie une référence `realise` quand le mois a assez de réalisé,
  `budget` sinon, `null` si aucun.
- Fonction pure et testable (couverte à l'étape 6).
- `npx tsc --noEmit` sans erreur.
