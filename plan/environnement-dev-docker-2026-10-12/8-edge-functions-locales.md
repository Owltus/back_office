# Étape 8 — Edge Functions en local, sans aucun e-mail réel

## Objectif

Les quatre fonctions tournent sur la stack locale (création et suppression de
compte, envoi de rapport, import nocturne). En local, un e-mail arrive dans
Mailpit et NULLE PART ailleurs, par construction.

## Fichier(s) impacté(s)

- `supabase/functions/_shared/environnement.ts` (nouveau) + test Deno
- `supabase/functions/_shared/send-mail.ts` (transport Mailpit en local, D12-B)
- `supabase/functions/{create-user,delete-user,send-report,import-report}/index.ts`
  (garde de clé ; commentaire obsolète l.7-8 de `import-report` corrigé)
- `supabase/functions/.env.local.example` (nouveau, versionné) ;
  `supabase/functions/.env.local` (gitignoré)
- `supabase/tests/fixtures/*.eml` (nouveaux, contenu FICTIF)
- `package.json` (`fn:serve`, `fn:import-essai`)

## Travail à réaliser

1. **`_shared/environnement.ts`** : `estLocal(SUPABASE_URL)` (hôte
   `kong`, `127.0.0.1`, `localhost`, `host.docker.internal`).
2. **Garde de clé** : en local, une `SB_SECRET_KEY` qui commence par
   `sb_secret_` (format de la prod, les clés locales sont des JWT) → la
   fonction refuse de démarrer, avec un message clair. C'est la protection
   contre la clé prod collée par erreur.
3. **Transport** : en local, `send-mail.ts` envoie par l'API HTTP de Mailpit
   (`http://mailpit:8025/api/v1/send` depuis le réseau Docker, URL lue d'une
   variable avec ce défaut). Resend n'est jamais appelé en local, même avec
   une clé. Ailleurs, rien ne change (Resend, `REPORT_TEST_TO`).
4. **`.env.local.example`** : `SB_SECRET_KEY` = la clé service locale de
   `supabase status`, `IMPORT_SECRET` = une valeur de dev, `REPORT_FROM`,
   `PIPELINE_WINDOW_BYPASS=true` (pour essayer en journée, sans risque en
   local).
5. **Fixtures `.eml`** : Comparison, Forecast, In-House, Addon FICTIFS, au
   format réel (structure relevée sur le code des parseurs, jamais copiée d'un
   vrai e-mail) ; `pnpm fn:import-essai` les poste avec `X-Import-Secret`,
   puis la veille avec `X-Import-Check: 1`.
6. Pas de Worker de dev (D11-A).

## Implications propres

- Aucun déploiement dans cette étape. Le comportement en prod est inchangé
  (le transport ne bascule que si l'URL est locale) : un test le fige.

## Phase de test /martin

- Famille A/E : `estLocal` (prod jamais locale) ; table de vérité
  (local / prod) × (clé locale / clé prod / absente) × (`REPORT_TEST_TO` posé
  ou non) → transport attendu ; aucune case « local » ne mène à Resend.
- Mutation : forcer `estLocal` à `false` → un test rouge.
- Essai réel local : création de compte depuis `/comptes` (admin de test),
  envoi du rapport, import des 4 fixtures puis rapport auto → les e-mails sont
  visibles dans Mailpit (`localhost:54324`), 0 appel `api.resend.com` dans
  les journaux.

## Critère de validation

- `deno test supabase/functions` vert.
- Parcours ci-dessus fait, captures de Mailpit.
- Commit sans push.

## Contrôle /borg

- Aucun chemin local vers Resend.
- Comportement prod identique (diff relu ligne à ligne sur la branche non
  locale).
- Aucun secret dans les fixtures ni dans `.env.local.example`.
