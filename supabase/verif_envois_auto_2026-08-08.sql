-- =============================================================================
-- verif_envois_auto_2026-08-08 — CONTRÔLE UNIQUE (lecture seule) de tout le socle
-- SQL des chantiers « envois auto + garde-fous cycle + remédiation audit ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. N'écrit RIEN.
-- Sort une checklist : controle | valeur | attendu | statut (OK / A VERIFIER).
-- Robuste aux objets absents (pas de cast ::regclass qui planterait le script).
-- =============================================================================

select controle, valeur, attendu, statut
from (

  -- 1. forecast_days.imported_at : colonne de fraîcheur du Forecast
  select 1 as ord,
    'forecast_days.imported_at' as controle,
    coalesce((select data_type || ' / nullable=' || is_nullable
              from information_schema.columns
              where table_schema='public' and table_name='forecast_days'
                and column_name='imported_at'), 'ABSENTE') as valeur,
    'timestamp with time zone / nullable=NO' as attendu,
    case when exists(select 1 from information_schema.columns
                     where table_schema='public' and table_name='forecast_days'
                       and column_name='imported_at' and is_nullable='NO'
                       and data_type='timestamp with time zone')
         then 'OK' else 'A VERIFIER' end as statut

  union all
  -- 2. Reset de la fenêtre transitoire : nb de lignes forecast « fraîches » (<12h).
  --    Attendu 0 JUSTE APRÈS le reset. NB : redevient >0 (normal) après un vrai
  --    import Forecast — dans ce cas ce n'est PAS une anomalie.
  select 2,
    'forecast_days fraîches (<12h)',
    (select count(*)::text from public.forecast_days
       where imported_at > now() - interval '12 hours'),
    '0 juste après reset (>0 normal après un vrai import)',
    case when (select count(*) from public.forecast_days
                 where imported_at > now() - interval '12 hours') = 0
         then 'OK' else 'A VERIFIER (import recent ?)' end

  union all
  -- 3. daily_reports.auto_sent_at : garde d'idempotence de l'envoi auto RepJour
  select 3,
    'daily_reports.auto_sent_at',
    coalesce((select data_type from information_schema.columns
              where table_schema='public' and table_name='daily_reports'
                and column_name='auto_sent_at'), 'ABSENTE'),
    'timestamp with time zone',
    case when exists(select 1 from information_schema.columns
                     where table_schema='public' and table_name='daily_reports'
                       and column_name='auto_sent_at')
         then 'OK' else 'A VERIFIER' end

  union all
  -- 4. Table pdj_auto_send_log (idempotence PDJ)
  select 4,
    'table pdj_auto_send_log',
    case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relname='pdj_auto_send_log')
         then 'présente' else 'ABSENTE' end,
    'présente',
    case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relname='pdj_auto_send_log')
         then 'OK' else 'A VERIFIER' end

  union all
  -- 5. RLS activée sur pdj_auto_send_log, 0 policy (défaut fermé, écrit par service_role)
  select 5,
    'pdj_auto_send_log : RLS + policies',
    coalesce((select 'rls=' || c.relrowsecurity::text from pg_class c
              join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relname='pdj_auto_send_log'), 'table absente')
      || ' / policies=' ||
      (select count(*)::text from pg_policies
       where schemaname='public' and tablename='pdj_auto_send_log'),
    'rls=true / policies=0',
    case when (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='pdj_auto_send_log') = true
          and (select count(*) from pg_policies
               where schemaname='public' and tablename='pdj_auto_send_log') = 0
         then 'OK' else 'A VERIFIER' end

  union all
  -- 6. Table pdj_report_recipients (destinataires PDJ = PII)
  select 6,
    'table pdj_report_recipients',
    case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relname='pdj_report_recipients')
         then 'présente' else 'ABSENTE' end,
    'présente',
    case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relname='pdj_report_recipients')
         then 'OK' else 'A VERIFIER' end

  union all
  -- 7. RLS + policies pdj_report_recipients (RLS on, policies gardées par page:pdj)
  select 7,
    'pdj_report_recipients : RLS + policies',
    coalesce((select 'rls=' || c.relrowsecurity::text from pg_class c
              join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relname='pdj_report_recipients'), 'table absente')
      || ' / policies=' ||
      (select count(*)::text from pg_policies
       where schemaname='public' and tablename='pdj_report_recipients'),
    'rls=true / policies>=1 (toutes to authenticated)',
    case when (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='pdj_report_recipients') = true
          and (select count(*) from pg_policies
               where schemaname='public' and tablename='pdj_report_recipients') >= 1
         then 'OK' else 'A VERIFIER' end

  union all
  -- 8. anon NE DOIT PAS avoir de policy sur pdj_report_recipients (PII)
  select 8,
    'pdj_report_recipients : policies visant anon',
    (select count(*)::text from pg_policies
     where schemaname='public' and tablename='pdj_report_recipients'
       and 'anon' = any(roles)),
    '0',
    case when (select count(*) from pg_policies
               where schemaname='public' and tablename='pdj_report_recipients'
                 and 'anon' = any(roles)) = 0
         then 'OK' else 'A VERIFIER' end

  union all
  -- 9. Table server_report_recipients (destinataires RepJour)
  select 9,
    'table server_report_recipients',
    case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relname='server_report_recipients')
         then 'présente' else 'ABSENTE' end,
    'présente',
    case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relname='server_report_recipients')
         then 'OK' else 'A VERIFIER' end

  union all
  -- 10. Anti-spam progressif : report_send_throttle.recent_sends
  select 10,
    'report_send_throttle.recent_sends',
    coalesce((select data_type from information_schema.columns
              where table_schema='public' and table_name='report_send_throttle'
                and column_name='recent_sends'), 'ABSENTE'),
    'jsonb',
    case when exists(select 1 from information_schema.columns
                     where table_schema='public' and table_name='report_send_throttle'
                       and column_name='recent_sends')
         then 'OK' else 'A VERIFIER' end

) t
order by ord;
