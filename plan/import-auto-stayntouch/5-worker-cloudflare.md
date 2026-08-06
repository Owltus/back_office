# Étape 5 — Worker Cloudflare « stayntouch_in_to_supabase »

## Objectif

Finaliser le Worker qui reçoit l'e-mail, filtre l'expéditeur et relaie l'e-mail
brut à l'Edge Function.

## Qui

**MOI** (code) — déjà écrit à `cloudflare/stayntouch_in_to_supabase.js`. Déploiement
à l'Étape 6.

## Fichier(s)

- `cloudflare/stayntouch_in_to_supabase.js` (finalisation si besoin)

## Travail à réaliser

1. Confirmer le filtre expéditeur : domaine contenant `stayntouch` → sinon
   `setReject`.
2. Lire l'e-mail brut (`message.raw`) et le POST vers `IMPORT_ENDPOINT` avec
   l'en-tête `X-Import-Secret`, `Content-Type: message/rfc822`.
3. Gestion d'échec : réseau → `setReject` (le PMS réessaiera) ; réponse non-2xx →
   `setReject` (échec visible côté envoi).
4. Variables du Worker (posées à l'Étape 6) : `IMPORT_ENDPOINT`, `IMPORT_SECRET`.

## Critère de validation

- Un e-mail d'un domaine ≠ stayntouch est rejeté sans appel à Supabase.
- Un e-mail stayntouch est relayé (visible dans les logs de l'Edge Function).
