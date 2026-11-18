-- Audit security-audit-skill run-2 du 2026-11-18, étape 11 du plan
-- `plan/securite-audit-run2-2026-11-18/11-nettoyage-supprimer.md`.
--
-- Réduire la surface de l'API : retirer ce que plus aucun écran n'appelle.
-- Migration qui RETIRE : la livraison demande `--supprimer`, avec l'accord de
-- l'utilisateur.
--
-- 1. `planning_valider(date, bigint, integer, boolean)` : remplacée par
--    `planning_valider_avec_repos` (2026-10-31), plus aucun appelant.
-- 2. `planning_supprimer_horaire(bigint)` : la version à UN argument. L'app
--    appelle la version à deux arguments (`p_passer_en_manuel`), gardée.
-- 3. `facturation_budget_line_delete`, `facturation_budget_line_upsert`,
--    `facturation_ref_reimport_replace` : relais public ET fonction privée,
--    plus aucun appelant dans `src/`.
-- 4. Table `classeur_acces` (exceptions par personne) et colonne
--    `classeur_classeurs.acces_tous` : plus lues depuis les types de
--    classeurs du 2026-11-16 (`visibilite`). La table est vide en prod comme
--    en local. Les fonctions `private.classeur_niveau_de` et
--    `private.classeur_lecture_ligne` ont un PARAMÈTRE nommé `p_acces_tous`
--    qui porte la visibilité : elles ne lisent pas la colonne et restent.
--
-- Innocuité : aucun appel restant (recherche dans `src/`, `supabase/functions/`,
-- `scripts/`, tests). Aucun `cascade` : si un objet inattendu dépendait de ce
-- qui part, la migration échouerait au lieu d'emporter autre chose.

-- 1 et 2 : planning
drop function if exists public.planning_valider(date, bigint, integer, boolean);
drop function if exists public.planning_supprimer_horaire(bigint);

-- 3 : facturation (relais public puis fonction privée)
drop function if exists public.facturation_budget_line_delete(text);
drop function if exists public.facturation_budget_line_upsert(text, text, text, text, text[], integer, boolean);
drop function if exists public.facturation_ref_reimport_replace(jsonb);
drop function if exists private.facturation_budget_line_delete(text);
drop function if exists private.facturation_budget_line_upsert(text, text, text, text, text[], integer, boolean);
drop function if exists private.facturation_ref_reimport_replace(jsonb);

-- 4 : classeur
drop trigger if exists audit_classeur_acces_tous on public.classeur_classeurs;
alter table public.classeur_classeurs drop column if exists acces_tous;
drop table if exists public.classeur_acces;
