# Étape 2 — Stack Supabase locale

## Objectif

`supabase start` démarre, sur le poste, une Supabase complète (Postgres 17,
Auth, PostgREST, Storage, Realtime, Edge Runtime, Studio, Mailpit), configurée
comme la prod sur ce qui compte.

## Fichier(s) impacté(s)

- `supabase/config.toml` (complété ; la section `[functions.import-report]`
  est CONSERVÉE à l'identique)
- `package.json` (scripts)

## Travail à réaliser

1. Mettre la CLI à jour (D14) et noter la version dans `releve-prod.md`.
2. Compléter `config.toml`, en partant du modèle de `supabase init` (dans un
   dossier temporaire, jamais sur le dépôt) :
   - `project_id = "back-office"` ;
   - `[api] schemas = ["public", "graphql_public"]` : **jamais `private`** ;
   - `[db] major_version = 17` ;
   - `[db.seed] sql_paths = ["./seed.sql"]` ;
   - `[auth]` : `site_url = "http://localhost:3000"`,
     `additional_redirect_urls` sur le port 3000, inscription publique
     alignée sur la prod (relevé de l'étape 0), mot de passe minimal 12 ;
   - `[auth.email]` : envoi vers Mailpit (défaut local) ;
   - `[storage]` : limite 20 MiB ;
   - `[analytics] enabled = false` ;
   - `[edge_runtime]` par défaut.
3. Scripts `package.json` :
   - `db:start` = `supabase start -x vector` ;
   - `db:stop` = `supabase stop` (garde les volumes) ;
   - `db:reset` = `supabase db reset` (efface tout, rejoue migrations et
     seed) ;
   - `db:statut` = `supabase status`.

## Implications propres

- RAM : environ 2 à 3 Go quand la stack tourne. `db:stop` la libère.
- 100 % local.

## Phase de test /martin

- Famille D : `db:stop` pendant que l'app tourne → le bandeau « panne » de
  l'app, sans éjection vers `/login` (règle du 2026-09-05), puis `db:start`
  → retour seul.

## Critère de validation

- `supabase status` liste API 54321, DB 54322, Studio 54323, Mailpit 54324.
- `curl http://127.0.0.1:54321/auth/v1/health` répond 200.
- `config.toml` : `git diff` montre la section `import-report` inchangée.
- Commit sans push.
