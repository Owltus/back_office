# Étape 3 — RepJour auto : exiger Comparison + Forecast FRAIS, sinon rien

## Objectif

Le cœur du chantier. L'envoi AUTO du RepJour ne doit partir QUE si, pour le cycle
courant, on a le Comparison ET un Forecast frais. Sinon : on n'envoie rien en
auto (le bouton manuel reste, lui, toujours disponible).

## Fichier(s) impacté(s)

- `supabase/functions/import-report/autoSend.ts`

## Travail à réaliser

### 1. Exiger un Forecast FRAIS (pas seulement « existe »)

Aujourd'hui `autoSend` envoie si `count(forecast_days du mois) > 0`. Remplacer par
une condition de FRAÎCHEUR basée sur `imported_at` (étape 2) et le cycle métier
(étape 1) :

- lire `max(imported_at)` des `forecast_days` du mois du rapport ;
- exiger que sa **date de cycle** (`businessDateStr(maxImportedAt)`) soit **égale
  à la date de cycle courante** (`businessDateStr(now)`).
- Si aucune ligne, ou forecast périmé (cycle précédent) → **ne pas envoyer**,
  renvoyer une note (`'Forecast pas frais pour ce cycle'`), l'envoi manuel reste
  possible.

Ainsi : Forecast en échec cette nuit (comme le 422 du 2026-08-08) → `imported_at`
reste au cycle précédent → **pas d'envoi auto** (correct). Quand un Forecast frais
arrive (ou au ré-import réussi), `autoSend` se redéclenche et envoie.

### 2. Ordre d'arrivée Comparison/Forecast

Le déclencheur reste appelé après chaque import (comparison OU forecast). Grâce à
la condition de fraîcheur :
- Comparison d'abord, Forecast pas encore frais → skip ; puis Forecast frais
  arrive → envoi.
- Forecast d'abord (frais), Comparison pas encore là → pas de ligne
  `daily_reports` → pas de candidat → skip ; puis Comparison arrive → envoi.
→ l'envoi part sur le SECOND des deux, quand la paire fraîche est complète.

### 3. Idempotence & récence calées sur le cycle

- Conserver la réservation atomique `auto_sent_at` (un envoi auto par rapport).
- Remplacer la fenêtre de récence calendaire (`now - 3 jours`) par une borne
  basée sur `businessDateStr` : n'auto-envoyer que le rapport dont la date est le
  cycle courant ou l'avant-veille récente (garder une petite tolérance, ex. 2
  cycles), jamais un vieux rapport.

### 4. Ne PAS toucher au filet manuel

L'envoi manuel passe par `send-report` (JWT admin) et ne consulte pas
`auto_sent_at` → il reste possible même si l'auto s'est abstenu. Vérifier qu'on ne
régresse pas là-dessus.

## Ordre d'exécution

1. Modifier la sélection du candidat + la condition Forecast (fraîcheur).
2. Adapter la fenêtre de récence au cycle.
3. `deno check` complet de `import-report`.

## Critère de validation

- Comparison seul (forecast périmé) → **pas d'envoi auto** (log « pas frais »).
- Comparison + Forecast frais → **1 envoi**, projeté recalculé sur le forecast frais.
- Ré-import → pas de second envoi auto (idempotence).
- Bouton manuel → envoie toujours, même quand l'auto s'est abstenu.

## Contrôle /borg

Étape critique (logique d'envoi réel). Auditer :
- Pas de double envoi (réservation atomique intacte).
- Aucune fenêtre où un vieux rapport partirait (récence cycle).
- Le forecast « frais » est bien celui du cycle courant (pas de faux positif si un
  ré-import partiel du mois met à jour `imported_at` sans couvrir tous les jours).
- Le chemin manuel n'est pas impacté.
