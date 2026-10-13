# Relevé de la prod — témoins de l'étape 0 (2026-10-13)

Lecture seule, poste encore lié à `ozpavwghrmmkrnmkxodg`. Aucune valeur
nominative recopiée ici. Ce fichier est l'ORACLE de l'étape 6 : la base
locale doit le reproduire.

---

## 1. Contrôles existants

| Script | Résultat | Remarque |
|---|---|---|
| `verif_advisor.sql` | **12/12**, « TOUT EST EN PLACE » | |
| `verif_complet.sql` | 19/20 — KO « pdj : insert+update fenetre 3j » | **Contrôle obsolète, prod conforme** : il attend 2 policies `pdj %(page:pdj)` avec `current_date - 3`, il y en a 3 depuis `pdj delete (page:pdj)` (`pdj_delete_manuel_ecriture_2026-09-28.sql`). insert, update, delete portent bien la fenêtre |
| `verif_audit_2026-09-06.sql` | 20/21 — KO « les 7 estampilleurs passent par private.keep_author » | **Contrôle obsolète, prod conforme** : il en attend 7, il y en a 8 depuis `classeur_stamp` (2026-09-25) ; aucune fonction n'a l'ancienne forme `new.x := old.x` |
| `verif_classeur_acces.sql` | **33/33** (« RESULTAT OK 33 / 33 », exception finale = annulation) | |

Attendu en local à l'étape 6 : les MÊMES résultats, KO obsolètes compris
(ou les deux contrôles corrigés des deux côtés, 3 et 8).

## 2. Catalogue

- **Postgres 17.6** (aarch64).
- **Extensions** : `btree_gist 1.7`, `pg_stat_statements 1.11`,
  `pgcrypto 1.3`, `uuid-ossp 1.1` (toutes dans `extensions`),
  `supabase_vault 0.3.1` (`vault`), `plpgsql`.
- **`pg_cron` : ABSENT** (`cron.job` n'existe pas) → **D7 = A**. Le job de
  `pdj_breakfasts.sql:95` n'a jamais été posé ; la purge RGPD passe par l'app
  et par l'import nocturne.
- **Schémas** : auth, extensions, graphql, graphql_public, private, public,
  realtime, storage, vault.
- **Empreinte** :

  | Schéma | Tables | Vues | Fonctions | Policies | Triggers |
  |---|---|---|---|---|---|
  | public | 47 | 6 | 66 | 123 | 44 |
  | private | 0 | 0 | 58 | 0 | 0 |

- **Triggers sur `auth.users` : AUCUN.** Les profils sont créés par l'Edge
  Function `create-user`, pas par un trigger : rien à reprendre à l'étape 4
  de ce côté (le plan le supposait).
- **Policies `storage.objects`** : `classeur-images read|insert|delete
  (page:classeur)`.
- **Buckets** : `classeur-images`, privé, 20 Mo (20 971 520), `image/webp`
  seul.
- **Publication `supabase_realtime`** : `public.parking_reservations` seule.
- **Réglages de rôles** (`pg_db_role_setting`, à reproduire en migration) :
  - `authenticated` : `statement_timeout=8s`, `idle_in_transaction_session_timeout=60s`
  - `anon` : `statement_timeout=3s`, `idle_in_transaction_session_timeout=60s`
  - `authenticator` : `statement_timeout=8s`, `lock_timeout=8s`,
    `idle_in_transaction_session_timeout=60s` (+ `safeupdate`, Supabase)
  - `postgres` : `idle_in_transaction_session_timeout=60s`
  - les autres sont ceux de Supabase.
- **`supabase_migrations.schema_migrations` : absente** (attendu, D8).
- **Volumes** : base 33 Mo ; 6 comptes `auth.users`, 6 profils ;
  141 fichiers en stockage, 5 Mo.

## 3. Secrets des Edge Functions (noms seulement)

Personnalisés : `IMPORT_SECRET`, `REPORT_FROM`, `RESEND_API_KEY`,
`SB_SECRET_KEY`. Fournis par Supabase : `SUPABASE_ANON_KEY`,
`SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`,
`SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.

**`REPORT_TEST_TO` n'est pas posé** en prod (normal : il servait aux essais).
Noms attendus par `livrer` (étape 9) : les 4 personnalisés.

## 4. Réglages Auth

Non relus dans le dashboard ce jour ; repris de CLAUDE.md (vérifiés le
2026-09-06) : mot de passe de 12 caractères minimum avec complexité, aucune
URL de redirection, MFA refusée, inscriptions publiques fermées (comptes
créés par `create-user`). À reproduire dans `config.toml` (étape 2).

## 5. Vercel

**Non relevé** : la CLI Vercel n'est pas installée sur le poste. Les
variables Preview restent inconnues. À voir par l'utilisateur dans le
dashboard (Settings → Environment Variables) ; rien n'est changé (D18-A).

## 6. Poste

- Supabase CLI 2.101.0 (2.120.0 disponible, D14-B) → **mise à jour en
  2.120.0** (scoop) à l'étape 2. Postgres local : 17.11 (prod 17.6, même
  majeure).
- Docker Desktop installé, WSL2 (distribution `docker-desktop`), **moteur
  arrêté** au moment du relevé : à démarrer avant l'étape 2.
- RAM : 31,8 Go, 8,5 Go libres.
- Ports 54321-54324 libres.

## 7. Motifs à ne jamais retrouver dans le dépôt

Contrôle PII des étapes 5 et 14, motifs génériques : adresses e-mail hors
`@exemple.test` dans `supabase/seed*` ; tout nom de client de
`pdj_breakfasts.guest_name` (comparaison faite en mémoire, jamais écrite).

## 8. Colonnes à anonymiser (étape 14)

Inventaire du catalogue (`information_schema.columns`, aucune valeur lue).

| Table | À anonymiser | Conservé |
|---|---|---|
| `pdj_breakfasts` | `guest_name` → « Client n » | `company`, `rate_plan`, `channel`, etc. (sociétés et codes, pas des personnes) |
| `parking_reservations` | `client` → « Client n » (même n que PDJ pour un même nom), `comment` vidé | `status` |
| `caisse_cautions` | `comment` vidé | `status` |
| `baby_cot_assignments` | `comment` vidé, `label` à examiner à l'écriture | |
| `literie_sheets`, `rapro_sheets`, `caisse_sheets` | `comment` vidé (texte libre) | initiales et nom de l'opérateur = personnel, conservés (D23) |
| `audit_log` | `old_data` : clés `guest_name`, `client`, `comment` anonymisées de la même façon | |

Sans donnée de personne : classeurs, facturation (émetteurs = sociétés),
PMS (agrégats), référentiels. Personnel conservé : `profiles`,
`classeur_document_versions.auteur`, `server_report_recipients` (adresses de
l'hôtel ; e-mails locaux vers Mailpit, D12).

Aucune colonne de plaque d'immatriculation : D22 « plaques remplacées » est
sans objet (une plaque écrite dans un commentaire part avec le commentaire).
