# Étape 3 — Module d'envoi Deno partagé (Resend), appelable en service_role

## Objectif

Extraire la logique d'envoi Resend dans un module Deno réutilisable, appelable
DIRECTEMENT par `import-report` (service_role, sans JWT admin) et par `send-report`.

## Qui

MOI.

## Contexte

`send-report` exige un JWT admin (garde l.87-93) et un throttle par utilisateur →
inadapté à l'auto-envoi (pas d'utilisateur). On extrait le cœur d'envoi.

## Fichier(s)

- `supabase/functions/import-report/send-mail.ts` (nouveau) — ou dossier `_shared`
- `supabase/functions/send-report/index.ts` (refactor pour consommer le module)

## Travail à réaliser

1. `sendViaResend({ from, to, cc, subject, html, attachments })` : POST Resend,
   bornes de taille, plafond destinataires, erreurs génériques (repris de
   send-report l.135-208), lecture `RESEND_API_KEY`, respect de `REPORT_TEST_TO`.
2. `fetchActiveRecipients(admin, table)` : lit `to`/`cc` actifs d'une table de
   destinataires (générique : `server_report_recipients` ou `pdj_report_recipients`).
3. `send-report/index.ts` : garder sa garde admin + throttle, mais déléguer l'envoi
   au module (pas de régression sur le bouton manuel existant).
4. L'auto-envoi (Étape 4) et l'envoi PDJ (Étape 7) appelleront ce module en
   service_role, sans throttle par user (idempotence gérée par date, Étape 4).

## Critère de validation

- Le bouton « Envoyer via serveur » (manuel) fonctionne toujours (non-régression).
- Le module est appelable sans JWT (depuis import-report) avec le secret système.

## Contrôle /borg

Critique (sécurité) : vérifier qu'extraire l'envoi n'ouvre pas un chemin non
authentifié (le module n'est jamais exposé en HTTP direct ; seul send-report garde
sa garde admin, et import-report sa barrière `X-Import-Secret`). Pas de fuite de
`RESEND_API_KEY`. `REPORT_TEST_TO` toujours respecté.
