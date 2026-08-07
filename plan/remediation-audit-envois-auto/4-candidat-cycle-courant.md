# Étape 4 — Borner le candidat au cycle courant (anti catch-up)

## Objectif

Ne jamais auto-envoyer un rapport d'un JOUR ANTÉRIEUR avec un projeté recalculé
depuis un Forecast d'un autre cycle (mélange de millésimes trompeur).

## Contexte

Le candidat actuel = « le `daily_reports` le plus récent par date, non auto-envoyé,
dans une fenêtre de ~3 jours ». Si la veille n'a pas été envoyée (Forecast pas
frais, panne) et que le Forecast du jour arrive AVANT le Comparison, le candidat
est encore le rapport de la veille → il part avec le Forecast d'aujourd'hui.

ATTENTION (divergence) : `repjour_auto_send.sql:22-23` documente ce rattrapage
comme VOULU. Cette étape le RESTREINT — à valider explicitement en Phase 5.

## Fichier(s) impacté(s)

- `supabase/functions/import-report/autoSend.ts`

## Travail à réaliser

### 1. Restreindre l'éligibilité à la date du cycle courant

Le rapport StayNTouch porte sur la veille de sa génération (`extractReportDate`
fait J-1). Au cycle courant, la date attendue du rapport est donc
`businessDateStr(J-1)`. On remplace la fenêtre « 3 jours » par une éligibilité
bornée au cycle : le candidat n'est retenu que si sa date correspond au rapport
attendu ce cycle (avec tolérance d'un jour pour la frontière 02 h).

```ts
// Date(s) de rapport acceptables pour un envoi AUTO ce cycle : le rapport porte
// sur la veille de sa generation. On accepte la date du cycle courant et celle
// de la veille (tolerance frontiere 02h). Tout rapport plus ancien -> manuel.
const cycleToday = businessDateStr()
const cycleYesterday = businessDateStr(new Date(Date.now() - 86_400_000))
if (D !== cycleToday && D !== cycleYesterday)
  return { sent: false, note: `hors cycle courant (${D}) — envoi auto ignore, manuel possible` }
```

Ce bloc remplace l'ancien test de récence `cutoff` (3 jours). Le catch-up des
jours plus anciens reste possible via le bouton manuel admin.

## Ordre d'exécution

1. Localiser le bloc `cutoff` actuel dans `autoSend.ts`.
2. Le remplacer par la borne cycle ci-dessus.

## Critère de validation

- `deno check` OK.
- Raisonnement : un rapport de la veille non envoyé n'est plus éligible si un
  Forecast plus récent arrive (sauf s'il correspond encore au cycle courant).
