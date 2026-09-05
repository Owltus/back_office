# Étape 5 — Fichiers d'autorité par schéma, anciens marqués remplacés, CLAUDE.md

## Objectif

Que le dépôt reflète la prod sans ambiguïté : un fichier d'autorité par
groupe (`private_schema_aides.sql`, `private_rpc_*.sql`,
`public_relais.sql`, `rpc_invoker_2026-09.sql`), les anciens fichiers de
fonctions marqués « REMPLACÉ PAR … NE PLUS REJOUER », et les fichiers de
policies mis à jour en `private.…`.

## Contexte

Dérives connues (agent SQL) : 4 définitions divergentes de `set_user_grade`
(deux sans `audit_log`), `admin_update_password` ×3 (une sans `audit_log`),
`facturation_learned_docs.sql` recrée une surcharge 5 args supprimée,
`facturation_admin_only.sql` est une concaténation, `page_level_rank` sans
`search_path` dans `page_permissions.sql`. Un rejeu d'un de ces fichiers
recréerait des fonctions `security definer` dans `public` (Advisor rouvert)
ou supprimerait la journalisation.

## Fichier(s) impacté(s)

- En-tête « REMPLACÉ » : `page_permissions.sql` (fonctions seulement),
  `security_core.sql` (idem), `repjour_send_reminder_dismiss.sql`,
  `rapro_occupancy_fn.sql`, `parking_tarifs.sql` (fonction), `literie.sql`
  (fonctions), tous les `facturation_*.sql` portant des fonctions,
  `facturation_admin_only.sql`, `remediation_securite_2026-08-04.sql`,
  `remediation_securite_2026-08-05.sql`, `remediation_securite_2026-08-05_lot3.sql`.
- Policies repointées : `page_permissions_rls*.sql`, `*_rls_fenetre_*.sql`,
  `perf_rls_ecriture_2026-09-05.sql`, `profiles.sql`, `gestion_budget_rls.sql`,
  `caisse_cautions*.sql`, `easter_eggs.sql`, `literie.sql`,
  `affiche_*.sql`, `pdj_addon_production.sql`, `pdj_externals.sql`.
- `CLAUDE.md` : section « Faits base de données » et « Backend Supabase ».

## Travail à réaliser

1. Un en-tête normalisé en tête de chaque fichier remplacé :
   `-- REMPLACÉ le 2026-09-xx par supabase/<nouveau>.sql — NE PLUS REJOUER
   (recréerait une fonction security definer dans public et rouvrirait le
   Security Advisor).` Le contenu reste pour l'historique.
2. Substitution `public.<aide>(` → `private.<aide>(` dans les fichiers de
   policies (même méthode que les miroirs du 2026-09-05, agent dédié,
   fins de ligne préservées).
3. `CLAUDE.md` : « Toute fonction `security definer` vit dans `private` ;
   `public` ne contient que des relais `security invoker` ou des fonctions
   invoker ; contrôle `supabase/verif_advisor.sql` ».

## Critère de validation

- Grep `security definer` dans `supabase/*.sql` : uniquement dans les
  nouveaux fichiers `private_*` et dans des fichiers portant l'en-tête
  « REMPLACÉ ».
- Grep `public.get_page_level(` dans les fichiers de policies : 0.
- Chaque nouveau fichier est rejouable seul (idempotent) et reproduit
  exactement la prod (`pg_get_functiondef` comparé).
