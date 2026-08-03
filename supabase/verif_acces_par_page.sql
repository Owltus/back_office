-- =============================================================================
-- CONTRÔLE — modèle d'accès par page (lecture / écriture / gestion)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor (LECTURE SEULE : que des
-- SELECT sur les catalogues, aucune écriture). Chaque ligne renvoie un verdict
-- OK / KO. Tout doit être OK après avoir passé les scripts dédiés de chaque page.
-- =============================================================================

-- 1) PARKING — 3 policies d'écriture avec la fenêtre 7 j (+ clause gestion).
select 'parking: policies fenetre 7j' as controle,
  count(*) as n,
  case when count(*) = 3 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'parking_reservations'
  and policyname like 'parking %(page:parking)'
  and (coalesce(qual, '') || coalesce(with_check, '')) like '%current_date - 7%';

-- 2) PARKING — trigger anti-recul du début présent.
select 'parking: trigger parking_no_past_rewrite' as controle,
  count(*) as n,
  case when count(*) = 1 then 'OK' else 'KO' end as verdict
from pg_trigger
where tgrelid = 'public.parking_reservations'::regclass
  and not tgisinternal and tgname = 'parking_no_past_rewrite';

-- 3) RAPRO — 6 policies (sheets + rooms) avec la fenêtre 2 j.
select 'rapro: policies fenetre 2j (sheets+rooms)' as controle,
  count(*) as n,
  case when count(*) = 6 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename in ('rapro_sheets', 'rapro_rooms')
  and policyname like 'rapro%(page:rapro)'
  and (coalesce(qual, '') || coalesce(with_check, '')) like '%current_date - 2%';

-- 4) RAPRO — fonction d'occupation sans PII (SECURITY DEFINER), pas de vue.
select 'rapro: fonction rapro_occupancy (secdef)' as controle,
  count(*) as n,
  case when count(*) = 1 then 'OK' else 'KO' end as verdict
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'rapro_occupancy' and prosecdef;
select 'rapro: plus de VUE rapro_occupancy' as controle,
  count(*) as n,
  case when count(*) = 0 then 'OK' else 'KO' end as verdict
from information_schema.views
where table_schema = 'public' and table_name = 'rapro_occupancy';

-- 5) CAISSE — 3 policies avec la fenêtre 1 j ; DELETE réservé gestion.
select 'caisse: policies fenetre 1j' as controle,
  count(*) as n,
  case when count(*) >= 2 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'caisse_sheets'
  and policyname like 'caisse %(page:caisse%'
  and (coalesce(qual, '') || coalesce(with_check, '')) like '%current_date - 1%';

-- 6) FACTURATION — aucune RPC d'écriture ne reste à « < 2 » (toutes en gestion).
select 'facturation: aucune garde < 2 restante' as controle,
  count(*) as restes,
  case when count(*) = 0 then 'OK' else 'KO' end as verdict
from pg_proc
where pronamespace = 'public'::regnamespace
  and prosrc like '%get_page_level(''facturation'')) < 2%';

-- 7) AFFICHAGE — colonne auteur + trigger d'estampille + policies par propriétaire.
select 'affichage: colonne created_by' as controle,
  count(*) as n,
  case when count(*) = 1 then 'OK' else 'KO' end as verdict
from information_schema.columns
where table_schema = 'public' and table_name = 'affiche_templates'
  and column_name = 'created_by';
select 'affichage: trigger affiche_templates_stamp' as controle,
  count(*) as n,
  case when count(*) = 1 then 'OK' else 'KO' end as verdict
from pg_trigger
where tgrelid = 'public.affiche_templates'::regclass
  and not tgisinternal and tgname = 'affiche_templates_stamp';
select 'affichage: update/delete par proprietaire (created_by)' as controle,
  count(*) as n,
  case when count(*) = 2 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'affiche_templates'
  and cmd in ('UPDATE', 'DELETE')
  and coalesce(qual, '') like '%created_by = auth.uid()%';
select 'affichage: plus de policy par role (get_user_role)' as controle,
  count(*) as n,
  case when count(*) = 0 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'affiche_templates'
  and (coalesce(qual, '') || coalesce(with_check, '')) like '%get_user_role%';

-- 8) REPJOUR — forecast en gestion ; import CSV (daily_reports) en écriture.
select 'repjour: forecast_days reserve gestion' as controle,
  count(*) as n,
  case when count(*) = 3 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'forecast_days'
  and policyname like 'forecast_days %(page:repjour)'
  and (coalesce(qual, '') || coalesce(with_check, '')) like '%= ''gestion''%';
select 'repjour: daily_reports en ecriture (>= 2)' as controle,
  count(*) as n,
  case when count(*) = 3 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'daily_reports'
  and policyname like 'daily_reports %(page:repjour)'
  and (coalesce(qual, '') || coalesce(with_check, '')) like '%>= 2%';

-- 9) BUDGET — écriture rattachée à repjour:gestion ; plus de policy par grade.
select 'budget: plus de policy Admin manages budget' as controle,
  count(*) as n,
  case when count(*) = 0 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'budget'
  and policyname = 'Admin manages budget';
select 'budget: ecriture reservee repjour:gestion' as controle,
  count(*) as n,
  case when count(*) = 3 then 'OK' else 'KO' end as verdict
from pg_policies
where schemaname = 'public' and tablename = 'budget'
  and policyname like 'budget %(page:repjour gestion)';

-- 10) LEGACY & GARDE-FOUS GLOBAUX
select 'legacy: plus aucun super_utilisateur' as controle,
  count(*) as n,
  case when count(*) = 0 then 'OK' else 'KO' end as verdict
from public.profiles where role = 'super_utilisateur';

select 'global: au moins un compte admin existe' as controle,
  count(*) as n,
  case when count(*) >= 1 then 'OK' else 'KO' end as verdict
from public.profiles where role = 'admin';

-- Anti-escalade REACTIVE apres la bascule (le script de bascule le desactive
-- temporairement ; il doit etre 'O' = enabled a la fin).
select 'securite: trigger protect_role_escalation actif' as controle,
  count(*) as n,
  case when count(*) = 1 then 'OK' else 'KO' end as verdict
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and tgname = 'protect_role_escalation' and tgenabled = 'O';
