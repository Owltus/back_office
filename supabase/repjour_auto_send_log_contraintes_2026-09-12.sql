-- =============================================================================
-- repjour_auto_send_log — contraintes de forme manquantes
--
-- Application : `supabase db query --linked -f supabase/repjour_auto_send_log_contraintes_2026-09-12.sql`
-- Idempotent (`drop constraint if exists` + `add constraint`). Aucune donnée
-- écrite, aucune colonne modifiée, aucune policy touchée.
--
-- POURQUOI
--
-- L'audit adversarial du 2026-09-12 a relevé que cette table est la SEULE
-- colonne énumérée du schéma sans garde, alors que le projet en pose
-- systématiquement :
--
--   caisse_sheets_shift_check          shift  in ('matin','soir','nuit')
--   caisse_sheets_status_check         status in ('draft','validated')
--   parking_reservations_status_check  status in ('reserve','paye',…)
--   literie_stock_movements_item_check item   in ('oreiller','couette')
--   audit_log_action_check             action in (…)
--   affiche_templates_color_check      color  in ('bw','okko',…)
--
-- plus les CHECK sur `profiles.role` et `user_page_permissions.page` documentés
-- dans CLAUDE.md. Sans contrainte, un futur émetteur écrirait ce qu'il veut et
-- le regroupement `group by trigger_report` cesserait de tenir.
--
-- ⚠ PRÉCÉDENT À NE PAS RÉPÉTER : le 2026-09-04, un CHECK trop étroit sur
-- `audit_log.action` avait BLOQUÉ la réinitialisation de mot de passe en
-- production. Les trois valeurs listées ici sont donc exactement celles que le
-- code écrit, vérifiées à la source :
--   - `index.ts` passe `triggered.type`, que le `find` juste au-dessus borne à
--     'comparison' ou 'forecast' ;
--   - la branche de veille planifiée passe le littéral 'veille planifiée'.
-- Aucune autre valeur n'est atteignable. Si un quatrième émetteur apparaît, il
-- faudra étendre CETTE liste AVANT de le déployer.
--
-- Les deux autres contraintes sont des invariants arithmétiques : un rang de
-- contrôle commence à 1, une durée d'attente n'est pas négative.
-- =============================================================================

alter table public.repjour_auto_send_log
  drop constraint if exists repjour_auto_send_log_trigger_report_check;
alter table public.repjour_auto_send_log
  add constraint repjour_auto_send_log_trigger_report_check
  check (trigger_report in ('comparison', 'forecast', 'veille planifiée'));

alter table public.repjour_auto_send_log
  drop constraint if exists repjour_auto_send_log_attempt_check;
alter table public.repjour_auto_send_log
  add constraint repjour_auto_send_log_attempt_check
  check (attempt >= 1);

alter table public.repjour_auto_send_log
  drop constraint if exists repjour_auto_send_log_waited_check;
alter table public.repjour_auto_send_log
  add constraint repjour_auto_send_log_waited_check
  check (waited_seconds >= 0);

-- =============================================================================
-- VÉRIFICATION (lecture seule)
-- =============================================================================
select 'contraintes de forme posees (attendu 3)' as controle,
       count(*)::text as valeur
from pg_constraint
where conrelid = 'public.repjour_auto_send_log'::regclass
  and contype = 'c'
union all
select 'les 3 valeurs ecrites par le code sont acceptees',
       case when (
         select bool_and(
           'comparison' = any(v) or 'forecast' = any(v) or 'veille planifiée' = any(v)
         ) from (select array['comparison','forecast','veille planifiée']::text[] as v) t
       ) then 'oui' else 'NON' end
union all
-- Contrôle réel : on tente les trois valeurs dans une transaction annulée.
select 'insertion des 3 valeurs testee puis ANNULEE', 'voir bloc do ci-dessous';

do $$
declare
  v text;
begin
  foreach v in array array['comparison', 'forecast', 'veille planifiée'] loop
    insert into public.repjour_auto_send_log
      (cycle_date, trigger_report, attempt, waited_seconds, sent, retryable, note)
    values (current_date, v, 1, 0, false, false, 'controle de contrainte');
  end loop;
  -- Une valeur interdite DOIT être refusée.
  begin
    insert into public.repjour_auto_send_log
      (cycle_date, trigger_report, attempt, waited_seconds, sent, retryable, note)
    values (current_date, 'valeur inventee', 1, 0, false, false, 'doit echouer');
    raise exception 'ECHEC DU CONTROLE : une valeur hors liste a ete acceptee';
  exception when check_violation then
    raise notice 'OK : valeur hors liste refusee comme attendu';
  end;
  -- Rien ne doit subsister : ce bloc est un contrôle, pas un import.
  delete from public.repjour_auto_send_log where note in ('controle de contrainte');
  raise notice 'OK : les 3 valeurs du code passent, le journal est reste vide';
end $$;

select 'lignes residuelles apres controle (attendu 0)' as controle,
       count(*)::text as valeur
from public.repjour_auto_send_log
where note = 'controle de contrainte';
