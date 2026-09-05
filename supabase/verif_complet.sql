-- =============================================================================
-- VÉRIFICATION COMPLÈTE — modèle d'accès par page (UN SEUL SCRIPT)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. LECTURE SEULE (que des
-- SELECT sur les catalogues + profils ; aucune écriture). Renvoie UN tableau
-- (controle, verdict) : chaque ligne OK/KO, et une dernière ligne
-- « RESULTAT GLOBAL ». Tout doit être OK.
-- =============================================================================

with checks(ordre, controle, ok) as (
  values
    -- PARKING
    (1, 'parking : 3 policies fenetre 7j',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='parking_reservations'
         and policyname like 'parking %(page:parking)'
         and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%current_date - 7%') = 3),
    (2, 'parking : trigger parking_no_past_rewrite',
      (select count(*) from pg_trigger
       where tgrelid='public.parking_reservations'::regclass
         and not tgisinternal and tgname='parking_no_past_rewrite') = 1),

    -- RAPRO
    (3, 'rapro : 6 policies fenetre 2j (sheets+rooms)',
      (select count(*) from pg_policies
       where schemaname='public' and tablename in ('rapro_sheets','rapro_rooms')
         and policyname like 'rapro%(page:rapro)'
         and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%current_date - 2%') = 6),
    -- Depuis private_rpc_relais.sql (2026-09-05) : la fonction privilégiée vit
    -- dans `private`, public ne porte qu'un relais SECURITY INVOKER.
    (4, 'rapro : fonction rapro_occupancy (SECURITY DEFINER, schema private)',
      (select count(*) from pg_proc
       where pronamespace='private'::regnamespace and proname='rapro_occupancy' and prosecdef) = 1),
    (5, 'rapro : plus de VUE rapro_occupancy',
      (select count(*) from information_schema.views
       where table_schema='public' and table_name='rapro_occupancy') = 0),

    -- CAISSE
    (6, 'caisse : policies fenetre 1j',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='caisse_sheets'
         and policyname like 'caisse %(page:caisse%'
         and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%current_date - 1%') >= 2),

    -- FACTURATION
    (7, 'facturation : aucune garde < 2 restante (tout gestion)',
      (select count(*) from pg_proc
       where pronamespace='public'::regnamespace
         and prosrc like '%get_page_level(''facturation'')) < 2%') = 0),

    -- AFFICHAGE
    (8, 'affichage : colonne created_by',
      (select count(*) from information_schema.columns
       where table_schema='public' and table_name='affiche_templates'
         and column_name='created_by') = 1),
    (9, 'affichage : trigger affiche_templates_stamp',
      (select count(*) from pg_trigger
       where tgrelid='public.affiche_templates'::regclass
         and not tgisinternal and tgname='affiche_templates_stamp') = 1),
    (10, 'affichage : update+delete par proprietaire (created_by)',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='affiche_templates'
         and cmd in ('UPDATE','DELETE')
         and coalesce(qual,'') like '%created_by = auth.uid()%') = 2),
    (11, 'affichage : plus de policy par role (get_user_role)',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='affiche_templates'
         and (coalesce(qual,'')||coalesce(with_check,'')) like '%get_user_role%') = 0),

    -- REPJOUR
    (12, 'repjour : forecast_days gestion (ou ecriture en mode manuel)',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='forecast_days'
         and policyname like 'forecast_days %(page:repjour)'
         and (coalesce(qual,'')||coalesce(with_check,'')) like '%= ''gestion''%') = 3
      and (select count(*) from pg_policies
       where schemaname='public' and tablename='forecast_days'
         and policyname like 'forecast_days %(page:repjour)'
         and cmd in ('INSERT','UPDATE')
         and (coalesce(qual,'')||coalesce(with_check,'')) like '%repjour_manual_forecast_allowed%') = 2),
    (13, 'repjour : daily_reports en ecriture (>= 2)',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='daily_reports'
         and policyname like 'daily_reports %(page:repjour)'
         and (coalesce(qual,'')||coalesce(with_check,'')) like '%>= 2%') = 3),

    -- BUDGET (/gestion)
    (14, 'budget : plus de policy Admin manages budget',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='budget'
         and policyname='Admin manages budget') = 0),
    (15, 'budget : ecriture reservee repjour:gestion',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='budget'
         and policyname like 'budget %(page:repjour gestion)') = 3),

    -- LEGACY & GARDE-FOUS GLOBAUX
    (16, 'legacy : plus aucun super_utilisateur',
      (select count(*) from public.profiles where role='super_utilisateur') = 0),
    (17, 'global : au moins un compte admin existe',
      (select count(*) from public.profiles where role='admin') >= 1),
    (18, 'securite : trigger protect_role_escalation actif',
      (select count(*) from pg_trigger
       where tgrelid='public.profiles'::regclass
         and tgname='protect_role_escalation' and tgenabled='O') = 1),

    -- PDJ
    (19, 'pdj : insert+update fenetre 3j',
      (select count(*) from pg_policies
       where schemaname='public' and tablename='pdj_breakfasts'
         and policyname like 'pdj %(page:pdj)'
         and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%current_date - 3%') = 2)
)
select controle,
       case when ok then 'OK' else 'KO' end as verdict
from (
  select ordre, controle, ok from checks
  union all
  select 999,
    'RESULTAT GLOBAL : ' ||
      case when bool_and(ok) then 'TOUT EST EN PLACE'
           else (count(*) filter (where not ok))::text || ' controle(s) en echec' end,
    bool_and(ok)
  from checks
) t
order by ordre;
