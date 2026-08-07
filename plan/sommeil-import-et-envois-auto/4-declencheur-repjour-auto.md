# Étape 4 — Déclencheur RepJour auto (les deux présents + recompute + idempotence)

## Objectif

Envoyer automatiquement le rapport journalier dès que le Comparison ET le Forecast
du jour sont en base, une seule fois, avec un projeté correct.

## Qui

MOI (code) + TOI (exécution du SQL).

## Fichier(s)

- `supabase/functions/import-report/{index.ts, repjour.ts}`
- `supabase/repjour_auto_send.sql` (nouveau — garde d'idempotence)

## Travail à réaliser

1. **Garde d'idempotence (SQL, à jouer par toi)** : ajouter `daily_reports.auto_sent_at
   timestamptz` (nullable), OU une table `repjour_auto_send_log(report_date PK,
   sent_at)`. Réservation atomique : `insert ... on conflict do nothing` / `update
   ... where auto_sent_at is null returning` avant l'appel Resend → deux invocations
   quasi simultanées n'envoient qu'une fois.
2. **Détection « les deux présents »** (dans `import-report`, après chaque import
   comparison/forecast pour le jour J = J-1 du Comparison) :
   - Comparison présent = ligne `daily_reports` pour `date`.
   - Forecast présent = des `forecast_days` existent pour `year`/`month` du jour.
3. **Recompute du projeté** : si le Comparison est arrivé AVANT le Forecast,
   `daily_reports.pm_*` = 0. À la complétion (arrivée du Forecast), recalculer
   `pm_*` depuis `forecast_days` et mettre à jour `daily_reports` AVANT l'envoi.
   (Réutilise la logique de `importComparison` l.612-656.)
4. **Envoi** : si les deux présents ET `auto_sent_at` non posé → réserver
   (atomique) → `buildRepjourEmail` (Étape 2) → `sendViaResend` (Étape 3) vers
   `server_report_recipients`. Respecter `IMPORT_DRY_RUN` (ne pas envoyer en test) et
   `REPORT_TEST_TO`.
5. Ignorer explicitement le rapport In-House pour ce déclencheur.
6. **Fallback manuel (requis) + relocalisation UI** : la fonction d'envoi serveur
   existante (qui construit déjà l'e-mail complet + PDF) est conservée comme secours,
   mais **déplacée dans la barre d'actions du HAUT (PageHeader), à côté de
   « Imprimer »** — une icône avec tooltip, admin only, qui **ouvre toujours
   `ServerSendDialog`** (vérification) avant l'envoi. NON bridée par `auto_sent_at`
   (renvoi explicite permis). **Relocaliser AUSSI le ⚙️ « Gérer les destinataires »**
   (RecipientsModal / `serverReportRecipients`) dans ce même groupe d'actions admin
   du PageHeader. **Retirer** l'ancien groupe inline « Copier l'image / Envoyer par
   email (mailto) / (dev) » devenu redondant (DashboardBoard.tsx).

## Critère de validation

- Comparison seul → pas d'envoi. Forecast seul → pas d'envoi. Les deux → 1 envoi.
- Ré-import (l'un ou l'autre) → PAS de second envoi (idempotence).
- Ordre Comparison-avant-Forecast → projeté recalculé, e-mail correct.
- En `IMPORT_DRY_RUN=true` → log seulement, aucun envoi.

## Contrôle /borg

Critique (envoi réel + concurrence + SQL) : vérifier l'atomicité de la garde
(pas de double envoi en cas d'arrivée simultanée), la justesse du projeté recalculé,
que rien ne part en dry-run, et l'absence d'impact sur l'import.
