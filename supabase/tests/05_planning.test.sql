-- =============================================================================
-- 05_planning.test.sql — page Planning (migration 20261027110000) sur la base
-- LOCALE : matrice des droits par niveau, semaine verrouillée figée, passé,
-- échange de shifts, cascades et contrôles d'intégrité.
--
-- Oracle : la spécification D4 du plan `plan/planning-portage-2026-10-27/`
-- (lecture = voir ; écriture = le planning ; gestion = le paramétrage et les
-- verrous), recopiée ici à la main, jamais lue dans les policies.
--
-- Comptes et données créés DANS la transaction (aucune dépendance au seed :
-- le fichier tourne aussi sur une copie de la prod). Tout est annulé.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- ---------------------------------------------------------------- comptes ---
create temp table t_compte (compte text primary key, uid uuid);
insert into t_compte values
  ('aucun',    'b1a00000-0000-4000-8000-0000000000a0'),
  ('lecture',  'b1a00000-0000-4000-8000-0000000000a1'),
  ('ecriture', 'b1a00000-0000-4000-8000-0000000000a2'),
  ('gestion',  'b1a00000-0000-4000-8000-0000000000a3');
insert into auth.users (id, email)
  select uid, 'test-planning-' || compte || '@exemple.test' from t_compte;
insert into public.profiles (id, email, role)
  select uid, 'test-planning-' || compte || '@exemple.test', 'utilisateur' from t_compte;
insert into public.user_page_permissions (user_id, page, level)
  select uid, 'planning', compte from t_compte where compte <> 'aucun';

-- ------------------------------------------------------------- utilitaires ---
create function pg_temp.en_tant_que(p_compte text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select uid from t_compte where compte = p_compte),
                      'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Exécute les commandes sous le compte, dans une sous-transaction ANNULÉE.
-- Rend la valeur de la DERNIÈRE commande (un select) ou son nombre de lignes,
-- ou err=SQLSTATE.
create function pg_temp.essai(p_compte text, p_sqls text[]) returns text
language plpgsql as $$
declare v text; s text; v_n bigint;
begin
  begin
    perform pg_temp.en_tant_que(p_compte);
    foreach s in array p_sqls loop
      if s ~* '^\s*(select|with)' then execute s into v;
      else execute s; get diagnostics v_n = row_count; v := v_n::text; end if;
    end loop;
    raise exception using errcode = 'P0T01';
  exception
    when sqlstate 'P0T01' then null;
    when others then v := 'err=' || sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- ---------------------------------------------------------------- données ---
-- Semaines : P passée, F à venir (dans deux semaines), L verrouillée (après F).
create temp table t_sem as
select private.planning_lundi(private.planning_aujourdhui()) - 7 as p,
       private.planning_lundi(private.planning_aujourdhui()) + 14 as f,
       private.planning_lundi(private.planning_aujourdhui()) + 21 as l;

insert into public.planning_horaires (code, nom, debut, fin, pause, raccourci)
  overriding system value
  values ('XM', 'Matin test', '07:00', '15:45', 45, 60);
create temp table t_ids as select
  (select id from public.planning_horaires where code = 'XM' and nom = 'Matin test') as h;
insert into public.planning_postes (nom, categorie, horaires_autorises)
  values ('Poste test A', 'reception', array[(select h from t_ids)]),
         ('Poste test B', 'autre', '{}');
alter table t_ids add column pa bigint, add column pb bigint;
update t_ids set pa = (select id from public.planning_postes where nom = 'Poste test A'),
                 pb = (select id from public.planning_postes where nom = 'Poste test B');
insert into public.planning_groupes (nom, postes_autorises)
  values ('Groupe test', array[(select pa from t_ids), (select pb from t_ids)]);
alter table t_ids add column g bigint;
update t_ids set g = (select id from public.planning_groupes where nom = 'Groupe test');
insert into public.planning_motifs (code, nom) values ('XC', 'Congé test');
alter table t_ids add column m bigint;
update t_ids set m = (select id from public.planning_motifs where nom = 'Congé test');
insert into public.planning_salaries (prenom, nom, groupe_id, competences, semaine_type)
select 'Test' || n, 'PLANNING', (select g from t_ids),
       jsonb_build_array(jsonb_build_object('poste_id', (select pa from t_ids), 'niveau', 'titulaire'),
                         jsonb_build_object('poste_id', (select pb from t_ids), 'niveau', 'occasionnel')),
       case n when 3 then '[{"mode":"repos"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"}]'::jsonb
              else '[{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"}]'::jsonb end
  from generate_series(1, 3) n;
alter table t_ids add column s1 bigint, add column s2 bigint, add column s3 bigint;
update t_ids set s1 = (select id from public.planning_salaries where prenom = 'Test1' and nom = 'PLANNING'),
                 s2 = (select id from public.planning_salaries where prenom = 'Test2' and nom = 'PLANNING'),
                 s3 = (select id from public.planning_salaries where prenom = 'Test3' and nom = 'PLANNING');

-- Shifts : F (à venir) — s1 lundi validé, s2 mardi proposé ; L (verrouillée) — s1 lundi.
insert into public.planning_affectations (lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, epinglee, pause)
select t_sem.f, t_ids.s1, t_ids.pa, 0, t_ids.h, '07:00', '15:45', true, 45 from t_sem, t_ids
union all
select t_sem.f, t_ids.s2, t_ids.pa, 1, t_ids.h, '07:00', '15:45', false, 45 from t_sem, t_ids
union all
select t_sem.l, t_ids.s1, t_ids.pa, 0, t_ids.h, '07:00', '15:45', true, 45 from t_sem, t_ids;
insert into public.planning_semaines_verrouillees (lundi) select l from t_sem;

create function pg_temp.q(p text) returns text language sql as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(p,
    ':PA', (select pa from t_ids)::text),
    ':PB', (select pb from t_ids)::text),
    ':F', quote_literal((select f from t_sem))),
    ':L', quote_literal((select l from t_sem))),
    ':P', quote_literal((select p from t_sem))),
    ':S1', (select s1 from t_ids)::text),
    ':S2', (select s2 from t_ids)::text),
    ':S3', (select s3 from t_ids)::text),
    ':M', (select m from t_ids)::text);
$$;

select plan(35);

-- -------------------------------------------------------------- lecture ---
select is(pg_temp.essai('aucun', array[pg_temp.q('select count(*) from public.planning_salaries where nom = ''PLANNING''')]),
  '0', 'aucun : ne lit aucune fiche');
select is(pg_temp.essai('aucun', array['select count(*) from public.planning_horaires']),
  '0', 'aucun : ne lit aucun code horaire');
select is(pg_temp.essai('lecture', array[pg_temp.q('select count(*) from public.planning_salaries where nom = ''PLANNING''')]),
  '3', 'lecture : lit les fiches');
select is(pg_temp.essai('lecture', array[pg_temp.q('select count(*) from public.planning_affectations where salarie_id in (:S1, :S2)')]),
  '3', 'lecture : lit les shifts');

-- -------------------------------------------------- écriture du planning ---
select is(pg_temp.essai('lecture', array[pg_temp.q(
  'insert into public.planning_affectations (lundi, salarie_id, poste_id, jour, debut, fin) values (:F, :S1, :PA, 3, ''09:00'', ''17:00'')')]),
  'err=42501', 'lecture : ne pose pas de shift');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_affectations (lundi, salarie_id, poste_id, jour, debut, fin) values (:F, :S1, :PA, 3, ''09:00'', ''17:00'')')]),
  '1', 'écriture : pose un shift');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id) values (:S1, :F::date + 4, :M)')]),
  '1', 'écriture : pose un jour d''absence');
select is(pg_temp.essai('aucun', array[pg_temp.q('select public.planning_vider(:F, false)')]),
  'err=42501', 'aucun : ne vide pas une semaine');

-- -------------------------------------------------------- paramétrage ---
select is(pg_temp.essai('ecriture', array[
  'insert into public.planning_salaries (prenom) values (''Intrus'')']),
  'err=42501', 'écriture : ne crée pas de fiche');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'update public.planning_postes set nom = ''Renommé'' where id = :PA')]),
  '0', 'écriture : ne renomme pas un poste (0 ligne)');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_salaries (prenom) values (''Nouvelle'')']),
  '1', 'gestion : crée une fiche');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_semaines_verrouillees (lundi) values (:F)')]),
  'err=42501', 'écriture : ne verrouille pas');
select is(pg_temp.essai('gestion', array[pg_temp.q(
  'insert into public.planning_semaines_verrouillees (lundi) values (:F)')]),
  '1', 'gestion : verrouille');

-- ------------------------------------------------ semaine verrouillée ---
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_affectations (lundi, salarie_id, poste_id, jour, debut, fin) values (:L, :S2, :PA, 2, ''09:00'', ''17:00'')')]),
  'err=PL423', 'verrouillée : aucun shift ajouté');
select is(pg_temp.essai('gestion', array[pg_temp.q(
  'delete from public.planning_affectations where lundi = :L')]),
  'err=PL423', 'verrouillée : la gestion ne supprime pas un shift réalisé');
select is(pg_temp.essai('gestion', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id) values (:S2, :L::date + 2, :M)')]),
  'err=PL423', 'verrouillée : aucun jour d''absence ajouté');
select is(pg_temp.essai('gestion', array[pg_temp.q('select public.planning_supprimer_poste(:PA)')]),
  'err=PL409', 'verrouillée : un poste d''un planning réalisé ne se supprime pas');
select is(pg_temp.essai('gestion', array[pg_temp.q('select public.planning_supprimer_salarie(:S1)')]),
  'err=PL409', 'verrouillée : une personne d''un planning réalisé ne se supprime pas');
select is(pg_temp.essai('gestion', array[pg_temp.q(
  'delete from public.planning_semaines_verrouillees where lundi = :L'),
  pg_temp.q('delete from public.planning_affectations where lundi = :L')]),
  '1', 'déverrouillée d''abord : le shift se supprime');

-- --------------------------------------------------------------- passé ---
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_appliquer_generation(:P, public.planning_etat_semaine(:P), false, ''{}'', false, ''[]'')')]),
  'err=PL409', 'passé : on ne génère pas une semaine terminée');
select is(pg_temp.essai('ecriture', array[pg_temp.q('select public.planning_vider(:P, false)')]),
  'err=PL409', 'passé : on ne vide pas une semaine terminée');

-- ------------------------------------------------------------ génération ---
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_appliquer_generation(:F, ''pas le bon état'', false, ''{}'', false, ''[]'')')]),
  'err=PL409', 'génération : refusée si le planning a changé pendant le calcul');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('select public.planning_appliquer_generation(:F, public.planning_etat_semaine(:F), false, ''{}'', false, '
    || quote_literal(json_build_array(
         json_build_object('salarie_id', (select s3 from t_ids), 'poste_id', (select pa from t_ids), 'jour', 2,
                           'horaire_id', (select h from t_ids), 'debut', '07:00', 'fin', '15:45', 'pause', 45))::text) || ')'),
  pg_temp.q('select string_agg(salarie_id || ''/'' || jour || ''/'' || epinglee, '','' order by salarie_id, jour) from public.planning_affectations where lundi = :F')]),
  (select s1 || '/0/true,' || s3 || '/2/false' from t_ids),
  'génération : la proposition de s2 est remplacée, le validé de s1 reste');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('select public.planning_vider(:F, true)'),
  pg_temp.q('select count(*) from public.planning_affectations where lundi = :F')]),
  '1', 'vider en gardant les validés');

-- ------------------------------------------------- échange de deux shifts ---
-- s1 lundi (validé) déposé sur la case de s2 mardi (occupée) : ils s'échangent.
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('select public.planning_modifier_shift((select id from public.planning_affectations where lundi = :F and salarie_id = :S1), ''{"salarie_id": :S2, "jour": 1}''::jsonb)'),
  pg_temp.q('select string_agg(salarie_id || ''/'' || jour || ''/'' || epinglee, '','' order by salarie_id, jour) from public.planning_affectations where lundi = :F')]),
  (select s1 || '/0/true,' || s2 || '/1/true' from t_ids),
  'échange : chacun prend la case de l''autre, les deux validés');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_affectations (lundi, salarie_id, poste_id, jour, debut, fin) values (:F, :S1, :PA, 0, ''09:00'', ''17:00'')')]),
  'err=23505', 'un seul shift par personne et par jour');

-- --------------------------------------------- absence : le shift part ---
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('insert into public.planning_absences (salarie_id, jour, motif_id) values (:S1, :F::date, :M)'),
  pg_temp.q('select count(*) from public.planning_affectations where lundi = :F and salarie_id = :S1 and jour = 0')]),
  '0', 'absence posée : le shift de ce jour est retiré');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_deplacer_statut(:F, :S3, 0, :S3, 2)')]),
  'err=PL409', 'jour fixe de la semaine type : ne se déplace pas au planning');

-- ----------------------------------------------- intégrité du paramétrage ---
select is(pg_temp.essai('gestion', array[pg_temp.q(
  'update public.planning_groupes set postes_autorises = array[:PA] where nom = ''Groupe test'''),
  pg_temp.q('select jsonb_array_length(competences)::text from public.planning_salaries where id = :S1')]),
  '1', 'catégorie restreinte : ses membres perdent les postes qu''elle ne permet plus');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_groupes set postes_autorises = array[:PA] where nom = ''Groupe test'''),
  pg_temp.q('update public.planning_salaries set competences = ''[{"poste_id": :PB, "niveau": "titulaire"}]'' where id = :S2')]),
  'err=PL400', 'compétence hors de la catégorie : refusée');
select is(pg_temp.essai('gestion', array[
  'update public.planning_horaires set debut = ''06:30'', fin = ''15:15'' where code = ''XM'' and nom = ''Matin test''',
  pg_temp.q('select string_agg(lundi::text || '' '' || debut || ''-'' || fin, '','' order by lundi) from public.planning_affectations where salarie_id = :S1')]),
  (select f::text || ' 06:30-15:15,' || l::text || ' 07:00-15:45' from t_sem),
  'code horaire modifié : les shifts à venir suivent, le réalisé ne change pas');
select is(pg_temp.essai('gestion', array[
  'select public.planning_supprimer_horaire((select id from public.planning_horaires where code = ''XM'' and nom = ''Matin test''))']),
  'err=PL409', 'code horaire seul permis d''un poste : ne se supprime pas');

-- --------------------------------------------------- import du prototype ---
select is(pg_temp.essai('ecriture', array['select public.planning_importer(''{"format": "planning-prototype-v20"}''::jsonb)']),
  'err=42501', 'import : réservé à la gestion');
select is(pg_temp.essai('gestion', array['select public.planning_importer(''{"format": "autre"}''::jsonb)']),
  'err=PL400', 'import : un fichier qui n''est pas un export du prototype est refusé');
select is(pg_temp.essai('gestion', array['select public.planning_importer(''{"format": "planning-prototype-v20"}''::jsonb)']),
  'err=PL409', 'import : jamais dans un planning qui a déjà des données');

select * from finish();
rollback;
