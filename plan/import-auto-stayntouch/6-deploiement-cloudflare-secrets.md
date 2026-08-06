# Étape 6 — Secrets, déploiement, branchement Cloudflare

## Objectif

Mettre le pipeline en ligne. **Aucune écriture de code** ici — que de la config,
côté toi, guidée pas à pas.

## Qui

**TOI** (guidé par MOI, comme pour `send-report`).

## Travail à réaliser

1. **Choisir un secret partagé** `IMPORT_SECRET` (chaîne aléatoire longue).
2. **Supabase** :
   - Poser le secret : `supabase secrets set IMPORT_SECRET="…"`.
   - Déployer la fonction : `supabase functions deploy import-report`.
   - Noter l'URL : `https://ozpavwghrmmkrnmkxodg.supabase.co/functions/v1/import-report`.
   - ⚠ La fonction doit être appelable **sans JWT** (déclenchée par le Worker, pas
     par un utilisateur connecté) → vérifier le réglage `verify_jwt = false` pour
     cette fonction (la sécurité vient de `X-Import-Secret`).
3. **Cloudflare — le Worker** :
   - Workers & Pages → créer le Worker **`stayntouch_in_to_supabase`** → coller le
     code de `cloudflare/stayntouch_in_to_supabase.js` → Deploy.
   - Settings → Variables (en **Secret**) : `IMPORT_ENDPOINT` (l'URL ci-dessus) +
     `IMPORT_SECRET` (le même qu'au 1).
4. **Cloudflare — la règle de routage** :
   - Email Routing → Règles de routage → `backoffice` @ `naostack.com` → action
     **« Envoyer à un Worker »** → choisir `stayntouch_in_to_supabase`.
5. **PMS StayNTouch** : configurer l'envoi des rapports vers `backoffice@naostack.com`.

## Critère de validation

- La règle Cloudflare pointe bien vers le Worker (plus « dans le vide »).
- Un envoi de test (Étape 7) déclenche le Worker puis la fonction.

## Contrôle /borg

Critique (mise en prod + secret) : vérifier que `verify_jwt=false` n'ouvre pas la
fonction sans le secret, que `IMPORT_SECRET` est identique des deux côtés, et que le
secret n'est jamais committé.
