# Étape 2 — Règle d'envoi RepJour : jonction mois/année (+ horloge unique)

## Objectif

Que le RepJour parte **avec les données qu'on a**, y compris le dernier jour du mois
et le 31 décembre — sans exiger un forecast « frais » du mois qui s'achève (il ne
viendra jamais). Garder l'exigence de fraîcheur UNIQUEMENT en milieu de mois (filet
anti mauvais chiffres). Corriger au passage le cas « deux horloges » sur un même POST.

## Contexte

Le RepJour est toujours en J-1. Le réalisé est là. Le projeté (`pm_*`) est calculé
depuis `forecast_days` du mois du rapport. Aujourd'hui, `autoSend.ts` exige que ce
forecast ait été **ré-importé cette nuit** (fenêtre 12h). Or la nuit du 1er (envoi du
dernier jour du mois précédent), StayNTouch a basculé au mois suivant : le forecast
reçu ne contient plus le mois qui s'achève → jugé « pas frais » → **envoi bloqué**,
alors que les données sont présentes et correctes. Même mécanique au 31/12 → 01/01.

## Fichier(s) impacté(s)

- `supabase/functions/import-report/autoSend.ts`
- `supabase/functions/import-report/index.ts` (horloge unique)

## Travail à réaliser

### 1. Détecter la jonction (mois du rapport != mois du cycle)

Dans `maybeAutoSendRepjour`, après avoir déterminé le candidat `D` (date du rapport) :

```ts
const cycleToday = businessDateStr(instant)      // ex. 2026-09-01 la nuit du 1er
const reportMonth = D.slice(0, 7)                // "2026-08"
const cycleMonth = cycleToday.slice(0, 7)        // "2026-09"
const isMonthBoundary = reportMonth !== cycleMonth
```

`isMonthBoundary` est vrai pour toute fin de mois (le rapport J-1 tombe dans un mois
différent du cycle courant), ce qui couvre AUSSI le 31/12 -> 01/01 (année différente).

### 2. Assouplir la règle de fraîcheur du forecast

Le forecast doit toujours être **PRÉSENT** pour le mois du rapport (sinon pas de
projeté possible). La **fraîcheur** (< 12h) n'est exigée QUE hors jonction :

```ts
const latestFc = /* max(imported_at) des forecast_days du mois du rapport, NON NULL */
if (!latestFc)
  return { sent: false, note: 'Forecast absent pour ce mois — envoi auto ignoré' }
const fcAgeMs = Date.now() - new Date(latestFc).getTime()
if (!isMonthBoundary && !(fcAgeMs >= 0 && fcAgeMs < FRESH_WINDOW_MS))
  return { sent: false, note: 'Forecast pas frais (milieu de mois) — envoi auto ignoré, manuel possible' }
// Jonction mois/année : forecast présent = suffisant (le mois est complet) -> on envoie.
```

Documenter clairement dans le code POURQUOI la fraîcheur saute à la jonction (le
forecast du mois clos ne sera jamais réimporté).

### 3. Horloge unique par requête (corrige le cas « deux horloges »)

Dans `index.ts`, capturer l'instant UNE fois et le propager, pour que l'import et
l'envoi décident sur la même heure :

```ts
const instant = new Date()
if (!isWithinPipelineWindow(instant)) { ... }
// puis passer `instant` aux appels d'envoi -> maybeAutoSendRepjour(admin, dryRun, instant)
```

`isWithinPipelineWindow`, `businessDateStr`, `parisHour` acceptent déjà `instant`.
Ajouter un paramètre `instant` à `maybeAutoSendRepjour` / `maybeAutoSendPdj` (défaut
`new Date()`) et l'utiliser pour la garde de fenêtre ET la détection de jonction.

## Ordre d'exécution

1. Ajouter le paramètre `instant` et la détection `isMonthBoundary` dans `autoSend.ts`.
2. Remplacer la condition de fraîcheur par la version assouplie (présent + frais hors jonction).
3. Propager `instant` depuis `index.ts` (et vers `autoSendPdj` par cohérence).

## Critère de validation

- `deno check --node-modules-dir=auto supabase/functions/import-report/index.ts` OK.
- Raisonnement, 3 cas :
  - Jour normal : forecast frais présent → envoi (inchangé).
  - Dernier jour du mois / 31 déc : forecast présent (pas frais) → **envoi** (nouveau).
  - Milieu de mois, forecast planté ce soir → pas frais → **pas d'envoi** (filet gardé) → bandeau.
- L'import et l'envoi d'un même POST utilisent la **même** heure.
