-- =============================================================================
-- REMPLACÉ le 2026-09-05 par supabase/private_rpc_relais.sql — NE PLUS REJOUER.
-- Rejouer ce fichier recréerait une fonction security definer dans public
-- (Security Advisor rouvert, doublon avec le relais) ou une garde périmée.
-- Conservé pour l'historique.
-- Fonctions concernées : daily_reports_occ, set_user_grade. NB : la policy
-- « daily_reports read (page:repjour) » (M2) n'a pas d'autre définition
-- versionnée ; elle est en prod
-- (contrôle : verif_securite_2026-08-04.sql). profiles insert (bornee) →
-- perf_rls_ecriture_2026-09-05.sql ; prevent_self_role_change → profiles.sql.
-- =============================================================================

-- =============================================================================
-- REMÉDIATION SÉCURITÉ — pentest du 2026-08-04 (script consolidé UNIQUE)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase -> SQL Editor, EN UNE FOIS.
-- Vérification séparée : `verif_securite_2026-08-04.sql`.
--
-- Couvre : E1 (anti-escalade INSERT profiles), M2 (fermeture daily_reports +
-- fonction occ minimale), F2 (CHECK format email), F4 (search_path des triggers
-- d'estampillage), I6 (garde dernier admin sur set_user_grade).
--
-- NON couvert ici (volontairement) :
--   - F3 (versionner get_user_role) : c'est du VERSIONNEMENT de dépôt (coller le
--     corps live dans security_core.sql), pas un changement de base.
--   - M1 (retrait des policies dupliquées des fichiers de table) : NE PAS jouer à
--     l'aveugle — droper une lecture permissive sans certitude que la policy
--     durcie (page:...) est déjà en base verrouillerait la lecture. C'est de
--     l'hygiène de DÉPÔT, à faire après le diagnostic. Ce script ne DROP donc
--     AUCUNE policy de lecture existante (sauf le swap ciblé de daily_reports).
--   - M3 (drop cascade rapro_rooms.sql) : édition de fichier, pas de base.
--
-- SÛR EN PRODUCTION : idempotent, transactionnel, additif. Le seul retrait est le
-- swap ciblé de la policy SELECT de daily_reports (drop + recreate atomiques).
-- Le CHECK email est GARDÉ : il ne s'applique que si aucune ligne n'est en
-- infraction (sinon NOTICE, pas d'échec de la transaction).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- E1 — Anti-escalade de rôle à l'INSERT de `profiles`
-- -----------------------------------------------------------------------------
-- Policy INSERT bornée : un admin insère n'importe quel rôle ; un non-admin ne
-- peut s'auto-insérer qu'en 'utilisateur'. (Le flux normal de création passe par
-- un admin dans ComptesBoard ; l'auto-inscription publique est désactivée.)
drop policy if exists "profiles insert (bornee)" on public.profiles;
-- 2026-09-05 : appels enveloppés en (select …), voir perf_rls_ecriture_2026-09-05.sql
create policy "profiles insert (bornee)"
  on public.profiles for insert to authenticated
  with check (
    (select public.is_admin())
    or (id = auth.uid() and role = 'utilisateur')
  );

-- Trigger anti-escalade étendu à l'INSERT (l'ancien ne gérait que l'UPDATE ;
-- il référence old.role et ne pouvait donc pas protéger l'INSERT).
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then new.role := 'utilisateur'; end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not public.is_admin() then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_role_escalation on public.profiles;
create trigger protect_role_escalation
  before insert or update on public.profiles
  for each row execute function public.prevent_self_role_change();

-- -----------------------------------------------------------------------------
-- M2 — Fermeture de `daily_reports` en lecture + fonction d'occupation minimale
-- -----------------------------------------------------------------------------
-- Fonction gardée page:rapro n'exposant QUE rj_nuitees (calquée sur
-- rapro_occupancy) : /rapro obtient l'occupation officielle sans pouvoir lire
-- tout le reporting financier.
create or replace function public.daily_reports_occ(p_date date)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select rj_nuitees
  from public.daily_reports
  where date = p_date
    and (select public.page_level_rank(public.get_page_level('rapro'))) >= 1
  limit 1;
$$;

revoke all on function public.daily_reports_occ(date) from public, anon;
grant execute on function public.daily_reports_occ(date) to authenticated;

-- Referme le SELECT de daily_reports sur page:repjour SEUL (retire le OR rapro).
-- On drop les DEUX noms possibles (ancien historique + nom actuel) pour couvrir
-- l'état live quel qu'il soit, puis on recrée la version fermée.
drop policy if exists "All read reports" on public.daily_reports;
drop policy if exists "daily_reports read (page:repjour ou rapro)" on public.daily_reports;
drop policy if exists "daily_reports read (page:repjour)" on public.daily_reports;
create policy "daily_reports read (page:repjour)"
  on public.daily_reports for select to authenticated
  using (
    (select public.page_level_rank(public.get_page_level('repjour'))) >= 1
  );

-- -----------------------------------------------------------------------------
-- I6 — `set_user_grade` refuse de rétrograder le dernier admin
-- -----------------------------------------------------------------------------
create or replace function public.set_user_grade(p_user uuid, p_grade text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_grade not in ('admin', 'utilisateur') then
    raise exception 'invalid grade: %', p_grade;
  end if;
  -- Garde dernier admin : refuser de rétrograder le seul admin restant.
  if p_grade <> 'admin'
     and exists (select 1 from public.profiles where id = p_user and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'dernier admin: rétrogradation refusée (verrouillage total)';
  end if;
  update public.profiles set role = p_grade where id = p_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- F4 — Figer search_path sur les fonctions trigger d'estampillage
-- -----------------------------------------------------------------------------
-- (idempotent ; complète lint_hardening_functions.sql pour que l'invariant tienne
--  même si un fichier de table est rejoué.)
do $$
declare
  fn text;
  fns text[] := array[
    'public.caisse_stamp()',
    'public.rapro_sheets_stamp()',
    'public.rapro_rooms_stamp()',
    'public.pms_daily_metrics_stamp()',
    'public.parking_set_updated_at()',
    'public.pdj_set_updated_at()',
    'public.easter_eggs_set_updated_at()'
  ];
begin
  foreach fn in array fns loop
    begin
      execute format('alter function %s set search_path = public', fn);
    exception
      when undefined_function then
        raise notice 'F4 : fonction absente, ignorée : %', fn;
    end;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- F2 — CHECK de format sur `email_recipients` (GARDÉ : seulement si 0 infraction)
-- -----------------------------------------------------------------------------
do $$
declare
  bad_count integer;
begin
  select count(*) into bad_count
  from public.email_recipients
  where email !~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$';

  if bad_count > 0 then
    raise notice 'F2 : % adresse(s) non conforme(s) — CHECK NON posé. Corrigez-les puis relancez ce bloc.', bad_count;
  else
    alter table public.email_recipients
      drop constraint if exists email_recipients_email_format;
    alter table public.email_recipients
      add constraint email_recipients_email_format
      check (email ~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$');
    raise notice 'F2 : CHECK posé (0 infraction).';
  end if;
end $$;

commit;

-- Fin. Lancer ensuite `verif_securite_2026-08-04.sql` pour contrôler la pose.
