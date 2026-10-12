# Plan — Environnement de dev séparé : base Supabase locale en Docker, prod intouchable

---

## Contexte

L'utilisateur, le 2026-10-12 : « lorsque l'on travaille, on travaille avec la
base de données Supabase directement, donc on est sur la prod […] je ne pense
pas que ça soit une très bonne pratique », « déplacer mon environnement de
travail de dev vers des conteneurs Docker pour que la version prod et la
version dev soient deux environnements différents », « faire le zinzin en mode
dev sans avoir peur de tout casser de l'autre côté », « tout raccorder comme il
faut, bien dissocier les deux méthodes de travail ».

Aujourd'hui, `pnpm dev` lit `.env` qui pointe sur la prod
(`ozpavwghrmmkrnmkxodg`). Le poste est LIÉ à la prod (`supabase link`). Cela
vaut pour `db query --linked` de l'assistant, pour les déploiements et pour les
secrets. Les essais d'écriture sont donc interdits. Les fonctions livrées le
2026-10-04 attendent encore leurs 4 essais réels, faute de base où les faire.

But : `pnpm dev` = une base Supabase COMPLÈTE sur le poste (Postgres, Auth,
Storage, Realtime, Edge Functions, boîte mail de test), remplie de données
fictives, cassable et réinitialisable en une commande. La prod n'est plus
atteinte que par un geste explicite, visible et confirmé.

---

## Ce que l'exploration a changé (5 agents, 2026-10-12)

| Fait établi | Conséquence |
|---|---|
| **Aucun `supabase/migrations/`** : 150 scripts à plat, sans ordre de rejeu, environ 30 marqués « NE PLUS REJOUER », un `facturation_reset_DANGER.sql` | Le schéma ne se reconstruit PAS en rejouant le dépôt. Il faut une baseline (étape 3) |
| Tables du socle (`profiles`, `daily_reports`, `forecast_days`, `budget`, `hotel_config`, `audit_log`) et trigger `auth.users → profiles` **jamais versionnés** (`profiles.sql` : « la définition réelle vit en prod ») | La seule image fidèle est un dump du SCHÉMA de la prod, en lecture seule (D3) |
| Le poste est lié à la prod (`supabase/.temp/project-ref`). Sans `--project-ref`, `functions deploy`, `secrets set` et `db query --linked` partent en prod | Les garde-fous passent AVANT tout le reste (étape 1) |
| La permission `allow Bash(supabase db query:*)` couvre aussi `--linked`. `.claude/` est gitignoré, donc les garde-fous ne sont pas versionnés | Il faut un garde mécanique (hook) dont le script est versionné (D10) |
| `supabase db query` accepte `--local` et `--db-url` (vérifié par `--help`). Le skill Bob ne le dit pas | Bob passe à `--local` par défaut |
| Côté front, aucune dissociation : ni mode Vite, ni `import.meta.env.DEV`, ni indicateur. `.env` est chargé AUSSI en mode development | Un `.env.development.local` mal rempli retomberait EN SILENCE sur la prod : garde de démarrage et bandeau (étape 7) |
| `AuthContext.tsx:146` déduit le ref par `hostname.split('.')[0]`, ce qui donne « 127 » pour `127.0.0.1`. `compteDeLaSession` prend la PREMIÈRE clé `sb-*-auth-token` | Le chemin de panne et le cache par compte risquent de se tromper en local. Un port par cible sépare les sessions (D13) |
| CSP (`vercel.json:21`) et `preconnect` (`__root.tsx:76`) écrits en dur sur le domaine prod | Le preconnect devient conditionnel. La CSP est inchangée (prod seule) |
| Les Edge Functions lisent `SB_SECRET_KEY`, nom PERSONNALISÉ, que `supabase functions serve` n'injecte PAS | Coller la clé prod dans le fichier d'environnement local = un dev qui écrit en prod. Garde dans le code (étape 8) |
| `_shared/send-mail.ts` appelle Resend en dur. Une base de dev avec les vrais `server_report_recipients` enverrait un vrai e-mail à l'hôtel | Aucun e-mail réel depuis la dev, PAR CONSTRUCTION (D12) |
| Le Worker Cloudflare est réservé à la prod (URL en dur, `wrangler deploy` écrase le Worker prod) | Pas de Worker de dev. `import-report` est testé par fixtures `.eml` (D11) |
| Une seule branche `main`, pas de CI, pas de hook git. Les variables Vercel Preview sont inconnues | À contrôler en lecture à l'étape 0 (D18) |
| Les 195 fichiers de test ne touchent aucune base (fetch simulé, `simulateurSupabase.ts`) | La vraie base locale ouvre enfin les tests RLS réels (étape 11) |
| Contradiction sur `pg_cron` : le CLAUDE.md du 24/09 dit « pas même installé », `pdj_breakfasts.sql:95` prévoit un job de purge RGPD | À trancher par une lecture à l'étape 0 (D7) |

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 0 | [0-etat-des-lieux.md](./0-etat-des-lieux.md) | Témoins de la prod (lecture), état du poste | — | P0 | 1h | `releve-prod.md` : verif_*, extensions, secrets (noms), Vercel |  |
| 1 | [1-garde-fous-prod.md](./1-garde-fous-prod.md) | Verrou anti-prod : délier, hook, Bob, Martin | 0 | P0 | 2h | Commande prod refusée sans geste explicite, preuve par essai | ⚠ |
| 2 | [2-stack-locale.md](./2-stack-locale.md) | `supabase start` + `config.toml` complet | 1 | P0 | 1h30 | API 54321, Studio 54323, Mailpit 54324 |  |
| 3 | [3-baseline-schema.md](./3-baseline-schema.md) | Baseline `migrations/` depuis le schéma prod | 2 | P0 | 3h | `supabase db reset` sans erreur sur base vide | ⚠ |
| 4 | [4-objets-hors-public.md](./4-objets-hors-public.md) | auth, storage, realtime, extensions, rôles | 3 | P0 | 2h | Trigger profils, bucket, policies, publication | ⚠ |
| 5 | [5-donnees-fictives.md](./5-donnees-fictives.md) | Seed fictif + comptes de test par rôle | 4 | P0 | 4h | `seed.sql` + générateur, 0 donnée réelle | ⚠ |
| 6 | [6-acceptation-base.md](./6-acceptation-base.md) | La base locale équivaut à la prod | 5 | P0 | 1h30 | verif_* locaux = témoins de l'étape 0 |  |
| 7 | [7-raccordement-front.md](./7-raccordement-front.md) | `pnpm dev` = local, bandeau, sessions, garde | 5 | P0 | 3h | `lib/environnement.ts` testé, bandeau DEV/PROD | ⚠ |
| 8 | [8-edge-functions-locales.md](./8-edge-functions-locales.md) | Fonctions en local, e-mails vers Mailpit | 5 | P1 | 3h | Création de compte et rapport en local, 0 e-mail réel | ⚠ |
| 9 | [9-flux-livraison.md](./9-flux-livraison.md) | Du local à la prod : migrations, checklist | 6 | P0 | 3h | `pnpm db:livrer` en essai à blanc, procédure écrite | ⚠ |
| 10 | [10-tests-base-reelle.md](./10-tests-base-reelle.md) | Tests RLS réels, simulateur confronté | 6 | P1 | 4h | `pnpm test:db`, mutations de policies attrapées |  |
| 11 | [11-vite-conteneur.md](./11-vite-conteneur.md) | (Optionnel) Vite dans un conteneur | 7 | P2 | 2h | `docker compose up` = app complète | |
| 12 | [12-documentation.md](./12-documentation.md) | CLAUDE.md, README, start.bat, mémoire | 7 à 10 | P0 | 1h30 | Une seule façon de travailler, écrite |  |
| 13 | [13-cloture.md](./13-cloture.md) | Parcours de bout en bout, prod intacte | toutes | P0 | 1h30 | Bilan, essais « zinzin », témoins identiques | ⚠ |

Total estimé : environ 30 h (sans l'étape 11).

---

## Ordre d'exécution

1. **0** : relever les témoins de la prod AVANT d'y couper l'accès. C'est l'oracle de l'étape 6.
2. **1** : les garde-fous d'abord. Tant qu'ils n'existent pas, tout le reste se fait avec une prod à portée de main.
3. **2 → 3 → 4 → 5** : la base locale, du vide au rempli, strictement en série.
4. **6** : preuve d'équivalence. Rien ne se raccorde à une base non prouvée.
5. **7 et 8** en parallèle possible (fichiers disjoints), puis **9** et **10**.
6. **11** seulement si D2 = A.
7. **12 → 13**.

Sprints : S1 = 0, 1 (sécurité immédiate, utile même si la suite attend) ;
S2 = 2 à 6 (la base) ; S3 = 7, 8 (l'app sur la base) ; S4 = 9, 10, 12, 13.

---

## Architecture cible

```
                 POSTE DE DÉVELOPPEMENT (Windows)
 ┌───────────────────────────────────────────────────────────────┐
 │  pnpm dev  (Vite, port 3000)  ── bandeau « DEV · base locale » │
 │       │                                                       │
 │       ▼  http://127.0.0.1:54321                               │
 │  ┌─────────────── Docker : supabase start ─────────────────┐  │
 │  │ Kong ─ PostgREST ─ GoTrue ─ Storage ─ Realtime ─ Edge   │  │
 │  │ Postgres 17 (54322) : migrations/ + seed fictif         │  │
 │  │ Studio (54323)   Mailpit (54324) ◄── tous les e-mails   │  │
 │  └──────────────────────────────────────────────────────────┘  │
 │                                                               │
 │  pnpm dev:prod (port 3001) ── bandeau ROUGE « PRODUCTION »     │
 │  (lecture d'enquête seulement, geste volontaire)              │
 └───────────────────────────────┬───────────────────────────────┘
                                 │ seul canal d'écriture :
                                 │ pnpm db:livrer  (migrations, confirmé)
                                 │ supabase functions deploy --project-ref …
                                 ▼
          PRODUCTION : Supabase ozpavwghrmmkrnmkxodg + Vercel (main)
                      + Worker Cloudflare (inchangé)
```

---

## Implications transverses

### Sécurité
- La prod n'est plus JAMAIS la cible par défaut d'aucun outil : app, CLI,
  assistant, Martin.
- Aucune donnée réelle ne quitte la prod : le dump est en `--schema-only`, et
  le seed est fabriqué. Contrôle : recherche de motifs réels (domaines
  clients, noms tirés de la prod lus à l'étape 0, plaques) sur le dépôt.
- Les clés locales (JWT de démonstration de la CLI) sont publiques par nature.
  Le fichier `supabase/functions/.env.local` est gitignoré quand même. Une clé
  `sb_secret_…` de prod y est REFUSÉE par le code (étape 8).

### Base de production (Nano)
- Lectures sur la prod limitées à l'étape 0 (verif_*, catalogue) et à
  l'étape 3 (dump du schéma). Environ 10 requêtes de catalogue, sans charge.
  Respecter le repos de 2 à 3 minutes avant une mesure (règle du
  2026-09-23).
- Écriture en prod dans tout le chantier : UNE seule, optionnelle
  (D8-A : `migration repair` qui crée `supabase_migrations.schema_migrations`),
  avec confirmation explicite.

### Cache et sessions
- Port 3000 = local, port 3001 = prod. Ce sont deux origines, donc deux
  `localStorage`, et aucun mélange de session ni de cache par compte.
- `lib/queryPersist.ts` : la version de cache n'est pas changée (les clés ne
  dépendent pas de la cible).

### Interface
- Un bandeau d'environnement fin en haut de chaque page, `/login` compris.
  En local : discret, ambre, « DEV · base locale ». Sur la prod servie par
  `vite dev` : rouge. Sur le site Vercel : rien. Le titre de l'onglet est
  préfixé en dev (« [DEV] Back Office »).

### Écritures réelles
- Les 4 essais attendus du 2026-10-04 (import avec refus, corbeille,
  transfert, PDF) se font désormais en LOCAL, sur les classeurs fictifs du
  seed.
- `CLAUDE.md` : la règle « l'assistant ne teste pas les écritures contre la
  prod » devient « l'assistant teste les écritures en LOCAL ».

---

## Phases de test /martin — règles communes

| Règle | Application |
|---|---|
| Verrou anti-prod | Martin écrit UNIQUEMENT sur `127.0.0.1:54322` / `:54321`. Il vérifie la cible par `lib/environnement.ts` (étape 7) et par l'URL, jamais par une variable seule |
| Oracles indépendants | Les témoins de la prod (étape 0) sont relevés AVANT la construction de la base locale. On ne compare jamais la base locale à elle-même |
| Écritures réversibles | Tests SQL en `begin … rollback` (pgTAP) ; `supabase db reset` entre deux campagnes |
| Mutation | Logique pure nouvelle (`lib/environnement.ts`, garde d'envoi, script de livraison) : Stryker ≥ 80 %. Policies : au moins 3 mutations posées à la main et ATTRAPÉES (étape 10) |
| Pas de bruit | Un échec qui ne se reproduit pas 3 fois de suite après `db reset` est jeté, pas mis en quarantaine |
| Familles | A propriétés (détection d'environnement, garde d'envoi) ; B matrices RLS rôle × table × opération ; C acceptation `verif_*` ; D chaos (stack arrêtée = bandeau panne, pas d'éjection) ; E sécurité (aucun chemin vers la prod sans geste explicite) |

---

## Angles à clarifier

Les 18 questions sont dans [D-decisions.md](./D-decisions.md) (partie A, avec
une recommandation pour chacune), et les questions de fond, ci-dessous,
viennent de la remise en cause /rodin :

1. **Le vrai problème est-il Docker, ou « on écrit en prod » ?** Les
   garde-fous (étape 1) suppriment l'essentiel du risque en 2 h, Docker
   supprime le reste. Les deux sont prévus, dans CET ordre.
2. **« Tout dans des conteneurs » est une simplification.** Vite dans un
   conteneur sous Windows coûte cher (pas d'inotify, `node_modules` natifs)
   pour un développeur seul. Le plan conteneurise la BASE et laisse Vite sur
   le poste (D2), avec une étape 11 optionnelle.
3. **Une base locale vide ne montre pas les vrais problèmes** : pagination de
   documents réels, volumes PDJ, lenteurs Nano. D'où D6 : un générateur à
   volume réaliste, jamais de copie.
4. **La dérive.** Si demain un correctif est encore joué en prod « à la main »,
   la base locale diverge en silence. Le chantier ne tient que si TOUT
   changement de schéma passe d'abord par une migration testée en local
   (étape 9). C'est une nouvelle discipline, pas un outil.
5. **Ce que la stack locale ne reproduit pas** : taille Nano, budget d'E/S,
   pannes de plateforme, `pg_cron` réel. Les mesures de performance restent
   des LECTURES en prod.
6. **Alternative la plus forte** : un second projet Supabase cloud gratuit.
   Il serait plus fidèle, accessible aux previews Vercel et sans Docker. Il se
   met en pause après 7 jours, consomme le quota d'un projet gratuit et ne se
   remet pas à zéro en une commande. Le plan reste en local, conformément à la
   demande ; le choix est réversible (D1).
7. **Une prod dans le dépôt cesse d'être la référence.** Après la baseline,
   la vérité du schéma est `supabase/migrations/`, plus le dashboard ni les
   150 fichiers. C'est la conséquence la plus durable du chantier.

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|---|---|---|
| Config Supabase | `supabase/config.toml` | `supabase/migrations/*.sql`, `supabase/seed.sql`, `supabase/seed/` (générateur) |
| Garde-fous | `.claude/skills/bob-assistant-supabase/SKILL.md`, `.claude/settings.local.json`, `.gitignore` | `scripts/garde-prod.mjs` (+ test) |
| Front | `src/lib/supabase.ts`, `src/components/auth/AuthContext.tsx`, `src/routes/__root.tsx`, `src/components/auth/AppAuthGate.tsx`, `.env.example`, `package.json`, `start.bat` | `src/lib/environnement.ts` (+ test), `src/components/shared/BandeauEnvironnement.tsx` (+ test), `.env.development.local` (gitignoré), `.env.production.local` (gitignoré) |
| Edge Functions | `_shared/send-mail.ts`, `import-report/index.ts` (commentaire), `send-report/index.ts`, `create-user`, `delete-user` (garde de clé) | `_shared/environnement.ts` (+ test Deno), `supabase/functions/.env.local.example`, `supabase/tests/fixtures/*.eml` |
| Tests base | `src/lib/classeur/test/simulateurSupabase.ts` (si écart) | `supabase/tests/*.test.sql` (pgTAP) |
| Livraison | — | `scripts/db-livrer.mjs`, `supabase/README.md` |
| Documentation | `CLAUDE.md`, `README.md`, mémoire | `releve-prod.md` (ce dossier) |
| Hors dépôt | `~/.claude/settings.json` (environment), skill martin | — |
| **Total** | **≈ 17 modifiés** | **≈ 22 nouveaux** |
