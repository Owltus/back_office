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
-- F et L loin dans l'avenir (dans environ 6 ans) : aucune donnée réelle n'y
-- est, même sur une copie de la prod ; les requêtes filtrent aussi sur les
-- fiches du test.
select private.planning_lundi(private.planning_aujourdhui()) - 7 as p,
       private.planning_lundi(private.planning_aujourdhui()) + 7 * 300 as f,
       private.planning_lundi(private.planning_aujourdhui()) + 7 * 301 as l;

-- Heures inhabituelles : deux horaires n'ont jamais les mêmes heures
-- (2026-10-31), et le fichier tourne aussi sur une copie de la prod.
insert into public.planning_horaires (nom, debut, fin, pause, periode)
  overriding system value
  values ('Matin test', '05:05', '13:50', 45, 'matin'),
         -- Commence à minuit : s'écrit 24:00 sur son jour (2026-11-02).
         ('Nuit test', '00:00', '06:55', 0, 'nuit');
create temp table t_ids as select
  (select id from public.planning_horaires where nom = 'Matin test') as h;
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
insert into public.planning_motifs (code, nom, nature, decompte) values ('XR', 'Repos test', 'repos', false);
alter table t_ids add column r bigint;
update t_ids set r = (select id from public.planning_motifs where nom = 'Repos test');
-- Jour férié rattrapé (2026-11-02) : un motif propre au test. Depuis le
-- 2026-11-06, c'est son RÔLE qui compte, jamais son code : il prend un code
-- quelconque et le rôle (retiré au motif qui l'a, un seul motif par rôle).
update public.planning_motifs set role = null where role = 'ferie_rattrape';
insert into public.planning_motifs (code, nom, nature, decompte, role) values ('XJ', 'JFR test', 'absence', true, 'ferie_rattrape');
alter table t_ids add column j bigint;
update t_ids set j = (select id from public.planning_motifs where nom = 'JFR test');
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
select t_sem.f, t_ids.s1, t_ids.pa, 0, t_ids.h, '05:05', '13:50', true, 45 from t_sem, t_ids
union all
select t_sem.f, t_ids.s2, t_ids.pa, 1, t_ids.h, '05:05', '13:50', false, 45 from t_sem, t_ids
union all
select t_sem.l, t_ids.s1, t_ids.pa, 0, t_ids.h, '05:05', '13:50', true, 45 from t_sem, t_ids;
insert into public.planning_semaines_verrouillees (lundi) select l from t_sem;
-- P doit être passée mais OUVERTE : sur une base de dev (ou une copie de la
-- prod), la semaine dernière est souvent verrouillée, et le verrou (PL423)
-- passerait avant la règle du passé (PL409) qu'on éprouve ici. La
-- transaction du test est annulée : le verrou revient tel quel.
delete from public.planning_semaines_verrouillees where lundi = (select p from t_sem);

create function pg_temp.q(p text) returns text language sql as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(p,
    ':PA', (select pa from t_ids)::text),
    ':PB', (select pb from t_ids)::text),
    ':F', quote_literal((select f from t_sem))),
    ':L', quote_literal((select l from t_sem))),
    ':P', quote_literal((select p from t_sem))),
    ':S1', (select s1 from t_ids)::text),
    ':S2', (select s2 from t_ids)::text),
    ':S3', (select s3 from t_ids)::text),
    ':M', (select m from t_ids)::text),
    ':R', (select r from t_ids)::text),
    ':J', (select j from t_ids)::text);
$$;

select plan(182);

-- -------------------------------------------------------------- lecture ---
select is(pg_temp.essai('aucun', array[pg_temp.q('select count(*) from public.planning_salaries where nom = ''PLANNING''')]),
  '0', 'aucun : ne lit aucune fiche');
select is(pg_temp.essai('aucun', array['select count(*) from public.planning_horaires']),
  '0', 'aucun : ne lit aucun horaire');
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
  pg_temp.q('delete from public.planning_affectations where lundi = :L and salarie_id in (:S1, :S2, :S3)')]),
  '1', 'déverrouillée d''abord : le shift se supprime');

-- --------------------------------------------------------------- passé ---
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_appliquer_generation(:P, public.planning_etat_semaine(:P), 0, false, ''{}'', false, ''[]'')')]),
  'err=PL409', 'passé : on ne génère pas une semaine terminée');
select is(pg_temp.essai('ecriture', array[pg_temp.q('select public.planning_vider(:P, false)')]),
  'err=PL409', 'passé : on ne vide pas une semaine terminée');

-- ------------------------------------------------------------ génération ---
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_appliquer_generation(:F, ''pas le bon état'', 0, false, ''{}'', false, ''[]'')')]),
  'err=PL409', 'génération : refusée si le planning a changé pendant le calcul');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('select public.planning_appliquer_generation(:F, public.planning_etat_semaine(:F), 0, false, ''{}'', false, '
    || quote_literal(json_build_array(
         json_build_object('salarie_id', (select s3 from t_ids), 'poste_id', (select pa from t_ids), 'jour', 2,
                           'horaire_id', (select h from t_ids), 'debut', '05:05', 'fin', '13:50', 'pause', 45))::text) || ')'),
  pg_temp.q('select string_agg(salarie_id || ''/'' || jour || ''/'' || epinglee, '','' order by salarie_id, jour) from public.planning_affectations where lundi = :F and salarie_id in (:S1, :S2, :S3)')]),
  (select s1 || '/0/true,' || s3 || '/2/false' from t_ids),
  'génération : la proposition de s2 est remplacée, le validé de s1 reste');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('select public.planning_vider(:F, true)'),
  pg_temp.q('select count(*) from public.planning_affectations where lundi = :F and salarie_id in (:S1, :S2, :S3)')]),
  '1', 'vider en gardant les validés');

-- ------------------------------------------------- échange de deux shifts ---
-- s1 lundi (validé) déposé sur la case de s2 mardi (occupée) : ils s'échangent.
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('select public.planning_modifier_shift((select id from public.planning_affectations where lundi = :F and salarie_id = :S1), ''{"salarie_id": :S2, "jour": 1}''::jsonb)'),
  pg_temp.q('select string_agg(salarie_id || ''/'' || jour || ''/'' || epinglee, '','' order by salarie_id, jour) from public.planning_affectations where lundi = :F and salarie_id in (:S1, :S2, :S3)')]),
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
  'update public.planning_horaires set debut = ''06:30'', fin = ''15:15'' where nom = ''Matin test''',
  pg_temp.q('select string_agg(lundi::text || '' '' || debut || ''-'' || fin, '','' order by lundi) from public.planning_affectations where salarie_id = :S1')]),
  (select f::text || ' 06:30-15:15,' || l::text || ' 05:05-13:50' from t_sem),
  'horaire modifié : les shifts à venir suivent, le réalisé ne change pas');
select is(pg_temp.essai('gestion', array[
  'select public.planning_supprimer_horaire((select id from public.planning_horaires where nom = ''Matin test''))']),
  'err=PL409', 'horaire seul permis d''un poste : ne se supprime pas');

-- ------------------------------------- aucune porte dérobée sur le réalisé ---
-- Contexte sans utilisateur (comme une fonction serveur à la clé service_role) :
-- le verrou tient quand même (revue du binôme du 2026-10-27).
select throws_ok(pg_temp.q('delete from public.planning_affectations where lundi = :L'),
  'PL423', null, 'verrouillée : refusée aussi sans utilisateur (clé serveur)');
-- La seule trace de l'auteur effacée (compte supprimé) n'est pas une retouche.
select lives_ok(pg_temp.q('update public.planning_affectations set created_by = null where lundi = :L'),
  'verrouillée : l''auteur peut être effacé (suppression d''un compte)');

-- --------------------------------------- heures recalées sur l'horaire ---
-- Plus de journée courte (2026-11-02) : un shift a toujours les heures de
-- son horaire ; la journée étoile est un autre horaire.
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('insert into public.planning_affectations (lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, pause) values (:F, :S3, :PA, 4, (select id from public.planning_horaires where nom = ''Matin test''), ''09:00'', ''10:00'', 0)'),
  pg_temp.q('select debut || ''-'' || fin || ''/'' || pause from public.planning_affectations where lundi = :F and salarie_id = :S3 and jour = 4')]),
  '05:05-13:50/45', 'un shift prend les heures et la pause de son horaire');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('update public.planning_affectations set horaire_id = (select id from public.planning_horaires where nom = ''Nuit test''), debut = ''00:00'' where lundi = :F and salarie_id = :S1 and jour = 0'),
  pg_temp.q('select debut || ''-'' || fin from public.planning_affectations where lundi = :F and salarie_id = :S1 and jour = 0')]),
  '24:00-06:55', 'un horaire qui commence à minuit s''écrit 24:00 sur son jour');

-- ------------------------------- poste de l'accueil (U1 du 2026-11-01) ---
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_postes (nom, presence, accueil_nuit) values (''Veille test'', false, true)'),
  pg_temp.q('select accueil_nuit::text from public.planning_postes where nom = ''Veille test''')]),
  'true', 'accueil : un poste peut tenir la nuit');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_postes (nom, presence, accueil_nuit) values (''Double test'', true, true)')]),
  'err=23514', 'accueil : un poste ne tient pas à la fois le jour et la nuit');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_besoins (poste_id, jour, debut, fin, effectif) values (:PA, 6, ''09:00'', ''10:00'', 1)'),
  pg_temp.q('select soutien::text from public.planning_besoins where poste_id = :PA and jour = 6 and debut = ''09:00''')]),
  '0', 'besoin : aucune place d''apprenti par défaut');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_salaries (prenom, nom, type_contrat, heures_hebdo, forfait_jours) values (''Cadre'', ''Test'', ''cdi'', 0, true)'),
  pg_temp.q('select forfait_jours::text from public.planning_salaries where prenom = ''Cadre'' and nom = ''Test''')]),
  'true', 'forfait jours : possible pour un CDI');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_salaries (prenom, nom, type_contrat, heures_hebdo, forfait_jours) values (''Appr'', ''Test'', ''apprenti'', 35, true)')]),
  'err=PL400', 'forfait jours : jamais pour un apprenti (case du modèle)');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_salaries (prenom, nom, type_contrat, heures_hebdo, mineur) values (''Jeune'', ''Test'', ''apprenti'', 35, true)'),
  pg_temp.q('select mineur::text from public.planning_salaries where prenom = ''Jeune'' and nom = ''Test''')]),
  'true', 'mineur : possible pour un apprenti');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_salaries (prenom, nom, type_contrat, heures_hebdo, mineur) values (''Jeune'', ''Cdi'', ''cdi'', 35, true)')]),
  'err=PL400', 'mineur : jamais en CDI (case du modèle)');
select is(pg_temp.essai('lecture', array['select releve_minutes::text from public.planning_reglages where id = 1']),
  (select releve_minutes::text from public.planning_reglages where id = 1), 'réglages : la lecture lit la relève');
select is(pg_temp.essai('ecriture', array['update public.planning_reglages set releve_minutes = 45 where id = 1']),
  '0', 'réglages : l''écriture ne change pas la relève (gestion seule)');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_reglages set releve_minutes = 45 where id = 1'),
  pg_temp.q('select releve_minutes::text from public.planning_reglages where id = 1')]),
  '45', 'réglages : la gestion règle la relève');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_postes set ouverture = ''7h'' where id = :PA')]),
  'err=23514', 'ouverture : une heure au format HH:MM seulement');

-- ------------------- règles de l'établissement (2026-11-05, migration 20261105100000) ---
select is(pg_temp.essai('lecture', array['select deux_repos_de_suite || ''/'' || personnes_nuit from public.planning_reglages where id = 1']),
  (select deux_repos_de_suite || '/' || personnes_nuit from public.planning_reglages where id = 1),
  'règles : la lecture lit les règles de l''établissement');
select is(pg_temp.essai('ecriture', array['update public.planning_reglages set personnes_nuit = 2 where id = 1']),
  '0', 'règles : l''écriture ne les change pas (gestion seule)');
select is(pg_temp.essai('gestion', array[
  'update public.planning_reglages set personnes_nuit = 2, continuite_obligatoire = false where id = 1',
  'select personnes_nuit || ''/'' || continuite_obligatoire from public.planning_reglages where id = 1']),
  '2/false', 'règles : la gestion les règle');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set repos_confort = 600 where id = 1']),
  'err=23514', 'règles : jamais un repos entre deux services sous les 11 h de la loi');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set jours_affiles_max = 7 where id = 1']),
  'err=23514', 'règles : jamais plus de 6 jours d''affilée (la loi)');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set jours_affiles_conseilles = 6, jours_affiles_max = 5 where id = 1']),
  'err=23514', 'règles : les jours conseillés ne dépassent pas le maximum');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set jour_isole = ''interdit'', jours_affiles_conseilles = 1 where id = 1']),
  'err=23514', 'règles : jour seul interdit avec un seul jour d''affilée conseillé est refusé');
select is(pg_temp.essai('gestion', array[
  'update public.planning_reglages set jour_isole = ''a_eviter'', jours_affiles_conseilles = 1 where id = 1',
  'select jour_isole || ''/'' || jours_affiles_conseilles from public.planning_reglages where id = 1']),
  'a_eviter/1', 'règles : un seul jour d''affilée avec le jour seul à éviter est permis');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set deux_repos_de_suite = ''parfois'' where id = 1']),
  'err=23514', 'règles : deux repos de suite obligatoire, souhaité ou aucune');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set journees_contrats = ''[{"minutes_hebdo":2100}]'' where id = 1']),
  'err=23514', 'règles : une journée imposée sans durée est refusée');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set journees_contrats = ''[{"minutes_hebdo":2100,"durees":[420],"courtes_max":0},{"minutes_hebdo":2100,"durees":[480],"courtes_max":0}]'' where id = 1']),
  'err=23514', 'règles : deux journées imposées pour la même durée de contrat sont refusées');
select is(pg_temp.essai('gestion', array[
  'update public.planning_reglages set journees_contrats = ''[{"minutes_hebdo":1800,"durees":[360],"courtes_max":0}]'' where id = 1',
  'select jsonb_array_length(journees_contrats)::text from public.planning_reglages where id = 1']),
  '1', 'règles : la gestion règle les journées imposées');

select is(pg_temp.essai('aucun', array['select count(*) from public.planning_modeles_contrat']),
  '0', 'modèles de contrat : aucun ne les lit');
select is(pg_temp.essai('lecture', array['select count(*) from public.planning_modeles_contrat']),
  (select count(*)::text from public.planning_modeles_contrat), 'modèles de contrat : la lecture les lit tous');
select is(pg_temp.essai('lecture', array['select placement_manuel::text from public.planning_modeles_contrat where type_contrat = ''extra''']),
  (select placement_manuel::text from public.planning_modeles_contrat where type_contrat = 'extra'),
  'modèles de contrat : la lecture lit le placement à la main de l''extra');
select is(pg_temp.essai('ecriture', array['update public.planning_modeles_contrat set alternance = true where type_contrat = ''cdi''']),
  '0', 'modèles de contrat : l''écriture ne les change pas');
select is(pg_temp.essai('ecriture', array['delete from public.planning_modeles_contrat where type_contrat = ''cdi''']),
  '0', 'modèles de contrat : l''écriture n''en supprime aucun');
select is(pg_temp.essai('gestion', array[
  'update public.planning_modeles_contrat set placement_manuel = true where type_contrat = ''cdd''',
  'select placement_manuel::text from public.planning_modeles_contrat where type_contrat = ''cdd''']),
  'true', 'modèles de contrat : la gestion les règle');
-- Types de contrat de l'établissement (2026-11-06, migration 20261106100000).
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_modeles_contrat (type_contrat, nom, placement_manuel) values (''contrat_t1'', ''Saisonnier test'', true)',
  'select nom || ''/'' || placement_manuel from public.planning_modeles_contrat where type_contrat = ''contrat_t1''']),
  'Saisonnier test/true', 'contrats : la gestion crée un type de contrat');
select is(pg_temp.essai('gestion', array['insert into public.planning_modeles_contrat (type_contrat) values (''contrat_t2'')']),
  'err=23502', 'contrats : un type de contrat sans nom est refusé');
select is(pg_temp.essai('gestion', array['insert into public.planning_modeles_contrat (type_contrat, nom) values (''contrat_t3'', ''cdi'')']),
  'err=23505', 'contrats : deux types de contrat ne portent pas le même nom');
select is(pg_temp.essai('gestion', array['insert into public.planning_modeles_contrat (type_contrat, nom) values (''Contrat T'', ''Essai'')']),
  'err=23514', 'contrats : un identifiant hors format est refusé');
select is(pg_temp.essai('ecriture', array['insert into public.planning_modeles_contrat (type_contrat, nom) values (''contrat_t4'', ''Essai'')']),
  'err=42501', 'contrats : l''écriture n''en crée pas');
select is(pg_temp.essai('gestion', array[
  'update public.planning_modeles_contrat set nom = ''Contrat à durée indéterminée'' where type_contrat = ''cdi''',
  'select nom from public.planning_modeles_contrat where type_contrat = ''cdi''']),
  'Contrat à durée indéterminée', 'contrats : la gestion renomme un contrat');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_salaries (prenom, nom, type_contrat) values (''Inconnu'', ''Test'', ''interim'')')]),
  'err=23503', 'contrats : une fiche ne prend qu''un contrat de la liste');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_salaries set type_contrat = ''cdd'' where id = :S1'),
  'delete from public.planning_modeles_contrat where type_contrat = ''cdd''']),
  'err=PL409', 'contrats : un contrat utilisé par une fiche ne se retire pas');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_modeles_contrat (type_contrat, nom) values (''contrat_t5'', ''Vide test'')',
  'delete from public.planning_modeles_contrat where type_contrat = ''contrat_t5''']),
  '1', 'contrats : un contrat que personne n''utilise se retire');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_modeles_contrat (type_contrat, nom, mineur_possible) values (''contrat_t6'', ''Jeunes test'', true)',
  pg_temp.q('insert into public.planning_salaries (prenom, nom, type_contrat, mineur) values (''Jeune'', ''T6'', ''contrat_t6'', true)'),
  'update public.planning_modeles_contrat set mineur_possible = false where type_contrat = ''contrat_t6''']),
  'err=PL409', 'contrats : « peut être mineur » ne se retire pas tant qu''un mineur a ce contrat');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_modeles_contrat (type_contrat, nom, forfait_possible) values (''contrat_t7'', ''Cadres test'', true)',
  pg_temp.q('insert into public.planning_salaries (prenom, nom, type_contrat, heures_hebdo, forfait_jours) values (''Cadre'', ''T7'', ''contrat_t7'', 0, true)'),
  'select forfait_jours::text from public.planning_salaries where nom = ''T7''']),
  'true', 'contrats : le forfait jours suit la case du contrat, pas son code');
select is(pg_temp.essai('gestion', array['update public.planning_modeles_contrat set jour_max_minutes = 780 where type_contrat = ''stagiaire''']),
  'err=23514', 'contrats : une durée max d''un jour au-delà de 12 h est refusée');
select is((select jour_max_minutes::text || '/' || mineur_possible || '/' || fin_obligatoire
             from public.planning_modeles_contrat where type_contrat = 'stagiaire'),
  '600/true/true', 'contrats : le stagiaire garde 10 h par jour, mineur possible, fin obligatoire');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_postes set jour_max_minutes = 780 where id = :PA')]),
  'err=23514', 'postes : jamais plus de 12 h de service (la loi)');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_postes set jour_max_minutes = 600 where id = :PA'),
  pg_temp.q('select jour_max_minutes::text from public.planning_postes where id = :PA')]),
  '600', 'postes : la gestion règle la durée max d''un service');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('update public.planning_postes set jour_max_minutes = 600 where id = :PA')]),
  '0', 'postes : l''écriture ne règle pas la durée max');
select is((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'planning_postes'
              and column_name = 'jour_max_minutes'),
  '690', 'postes : un poste neuf a 11 h 30 de service au plus');
select is(pg_temp.essai('gestion', array[
  'update public.planning_reglages set ferie_anciennete_mois = 6, ferie_rattrapage_jours = 60 where id = 1',
  'select ferie_anciennete_mois || ''/'' || ferie_rattrapage_jours from public.planning_reglages where id = 1']),
  '6/60', 'jours fériés : la gestion règle ancienneté et délai de rattrapage');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set ferie_rattrapage_jours = 400 where id = 1']),
  'err=23514', 'jours fériés : un délai de rattrapage hors bornes est refusé');
select is(pg_temp.essai('ecriture', array['update public.planning_reglages set ferie_anciennete_mois = 6 where id = 1']),
  '0', 'jours fériés : l''écriture ne règle pas l''ancienneté');
select is(pg_temp.essai('gestion', array[
  'update public.planning_groupes set forfait_possible = true where nom = ''Groupe test''',
  'select forfait_possible::text from public.planning_groupes where nom = ''Groupe test''']),
  'true', 'groupes : la gestion règle « cadres au forfait jours possibles »');
select is(pg_temp.essai('gestion', array['update public.planning_modeles_contrat set ferie_rattrape = true, feries_jour_meme = true where type_contrat = ''cdi''']),
  'err=23514', 'modèles de contrat : jamais un jour férié rattrapé ET pris le jour même');

select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_postes set importance = ''vital'' where id = :PA')]),
  'err=23514', 'importance : indispensable, important ou si possible');
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('update public.planning_postes set importance = ''si_possible'' where id = :PA')]),
  '0', 'importance : l''écriture ne la change pas');
select is((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'planning_postes'
              and column_name = 'importance'),
  '''si_possible''::text', 'importance : un poste neuf n''est pas indispensable');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_postes set fermeture = ''23h'' where id = :PA')]),
  'err=23514', 'fermeture : une heure au format HH:MM seulement');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_besoins (poste_id, jour, debut, fin, effectif) values (:PA, 5, ''09:00'', ''10:00'', 1)'),
  pg_temp.q('select obligatoire || ''/'' || coalesce(niveau_min, ''tous'') || ''/'' || niveaux::text from public.planning_besoins where poste_id = :PA and jour = 5 and debut = ''09:00''')]),
  'true/tous/[]', 'besoin : obligatoire, tout niveau autonome, par défaut (2026-11-06)');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_besoins (poste_id, jour, debut, fin, effectif, niveau_min) values (:PA, 5, ''09:00'', ''10:00'', 1, ''licorne'')')]),
  'err=23503', 'besoin : un niveau demandé inconnu est refusé (clé étrangère, 2026-11-06)');

-- ------------------------------------ consignes de présence (2026-10-28) ---
select is(pg_temp.essai('aucun', array['select count(*) from public.planning_consignes']),
  '0', 'consignes : aucun ne les lit');
select is(pg_temp.essai('lecture', array['select count(*) from public.planning_consignes']),
  (select count(*)::text from public.planning_consignes), 'consignes : la lecture les lit toutes');
select is(pg_temp.essai('ecriture', array[
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''matin'', 1, 1)']),
  'err=42501', 'consignes : l''écriture ne les règle pas');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 5, ''matin'', 3, 3)',
  'select minimum || ''-'' || maximum from public.planning_consignes']),
  '3-3', 'consignes : la gestion règle un chiffre exact (3 le samedi matin, 2026-11-01)');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 5, ''matin'', 3, 4)',
  'select minimum || ''-'' || maximum from public.planning_consignes']),
  '3-4', 'consignes : au moins 3, au plus 4 (2026-11-06, CHECK exact retiré)');
select is((select count(*)::text from pg_constraint where conname = 'planning_consignes_exact'),
  '0', 'consignes : plus de contrainte de chiffre exact');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''soir'', 3, 2)']),
  'err=23514', 'consignes : un plafond sous le minimum est refusé');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''nuit'', 1, 1)',
  'select periode || ''-'' || minimum from public.planning_consignes']),
  'nuit-1', 'consignes : la nuit est acceptée (2026-10-30)');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''midi'', 1, 1)']),
  'err=23503', 'consignes : un moment inconnu est refusé (clé étrangère, 2026-11-06)');

-- ------------------------------ moments de l'établissement (2026-11-06) ---
select is((select string_agg(id || ':' || compte_dans_tableau || ':' || est_nuit, ',' order by ordre)
    from public.planning_moments),
  'matin:true:false,middle:false:false,soir:true:false,nuit:true:true',
  'moments : ceux de l''hôtel, le middle hors du tableau, la nuit');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_moments (id, nom, ordre, priorite, debut_de, debut_a, compte_dans_tableau) values (''midi'', ''Midi'', 5, 0, 600, 780, true)',
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''midi'', 2, 2)',
  'select periode || ''-'' || minimum from public.planning_consignes']),
  'midi-2', 'moments : la gestion crée « Midi », il a son chiffre au tableau');
select is(pg_temp.essai('ecriture', array[
  'insert into public.planning_moments (id, nom) values (''midi'', ''Midi'')']),
  'err=42501', 'moments : l''écriture ne les règle pas');
select is(pg_temp.essai('aucun', array['select count(*) from public.planning_moments']),
  '0', 'moments : aucun ne les lit');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_moments where id = ''matin''']),
  'err=23503', 'moments : un moment qui a des horaires ne se retire pas');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_moments (id, nom) values (''Midi !'', ''Midi'')']),
  'err=23514', 'moments : un identifiant hors format est refusé');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''soir'', 2, 2)',
  'update public.planning_moments set compte_dans_tableau = false where id = ''soir''']),
  'err=PL409', 'moments : un moment qui a des chiffres ne sort pas du tableau (relecture du 2026-11-06)');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''soir'', 0, 0)',
  'update public.planning_moments set compte_dans_tableau = false where id = ''soir''',
  'select compte_dans_tableau::text from public.planning_moments where id = ''soir''']),
  'false', 'moments : des chiffres à 0 ne le retiennent pas');
select is(pg_temp.essai('gestion', array[
  'update public.planning_moments set nom = ''Soir'' where id = ''matin''']),
  'err=23505', 'moments : deux moments ne portent pas le même nom');
select is(pg_temp.essai('gestion', array[
  'update public.planning_moments set nom = ''~matin'' where id = ''matin''',
  'update public.planning_moments set nom = ''Matin'' where id = ''soir''',
  'update public.planning_moments set nom = ''Soir'' where id = ''matin''',
  'select string_agg(id || ''='' || nom, '','' order by id) from public.planning_moments where id in (''matin'', ''soir'')']),
  'matin=Soir,soir=Matin', 'moments : deux noms s''échangent par un nom d''attente (comme l''app)');
select is(pg_temp.essai('gestion', array[
  'update public.planning_moments set article = ''la'' where id = ''soir''',
  'select article from public.planning_moments where id = ''soir''']),
  'la', 'moments : l''article du nom se règle');
select is(pg_temp.essai('gestion', array[
  'update public.planning_moments set article = ''les'' where id = ''soir''']),
  'err=23514', 'moments : un article inconnu est refusé');

-- -------------------------------- zones de l'établissement (2026-11-06) ---
select is((select nom || ':' || continue from public.planning_zones where id = 1),
  'Accueil:true', 'zones : l''accueil est la zone 1, tenue en continu');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_zones (id, nom, ordre) values (2, ''Room service'', 1)',
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''matin'', 2, 2)',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (2, 0, ''matin'', 1, 1)',
  'select string_agg(zone_id || ''-'' || minimum, '','' order by zone_id) from public.planning_consignes']),
  '1-2,2-1', 'zones : une seconde zone a son chiffre, le même matin que l''accueil');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_consignes',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''matin'', 2, 2)',
  'insert into public.planning_consignes (zone_id, jour, periode, minimum, maximum) values (1, 0, ''matin'', 1, 1)']),
  'err=23505', 'zones : un seul chiffre par zone, jour et moment');
select is(pg_temp.essai('ecriture', array[
  'insert into public.planning_zones (nom) values (''Essai'')']),
  'err=42501', 'zones : l''écriture ne les règle pas');
select is(pg_temp.essai('aucun', array['select count(*) from public.planning_zones']),
  '0', 'zones : aucun ne les lit');

select is(pg_temp.essai('gestion', array[
  'update public.planning_reglages set weekend_jours = ''{6,0}''']),
  'err=23514', 'week-end : des jours qui ne se suivent pas dans la semaine sont refusés');
select is(pg_temp.essai('gestion', array[
  'update public.planning_reglages set weekend_jours = ''{4,4,6}''']),
  'err=23514', 'week-end : un jour en double qui ferait croire à trois jours est refusé');
select is(pg_temp.essai('gestion', array[
  'update public.planning_reglages set weekend_jours = ''{4,5,6}''',
  'select weekend_jours::text from public.planning_reglages']),
  '{4,5,6}', 'week-end : vendredi, samedi et dimanche sont acceptés');

-- ------------------------------ niveaux de l'établissement (2026-11-06) ---
select is((select string_agg(id || ':' || nom || ':' || autonome || ':' || jamais_seul, ',' order by ordre)
    from public.planning_niveaux),
  'titulaire:Titulaire:true:false,occasionnel:Dépannage:true:false,soutien:Soutien:false:true',
  'niveaux : ceux de l''hôtel, le soutien jamais seul');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_niveaux (id, nom, ordre) values (''confirme'', ''Confirmé'', 1)',
  pg_temp.q('update public.planning_salaries set competences = ''[{"poste_id": :PA, "niveau": "confirme"}]'' where id = :S1'),
  pg_temp.q('select competences -> 0 ->> ''niveau'' from public.planning_salaries where id = :S1')]),
  'confirme', 'niveaux : la gestion crée « Confirmé », une fiche le prend');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_salaries set competences = ''[{"poste_id": :PA, "niveau": "licorne"}]'' where id = :S1')]),
  'err=PL400', 'niveaux : un niveau inconnu est refusé dans une fiche');
select is(pg_temp.essai('gestion', array[
  'delete from public.planning_niveaux where id = ''titulaire''']),
  'err=PL409', 'niveaux : un niveau utilisé ne se retire pas');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_niveaux (id, nom, ordre) values (''essai'', ''Essai'', 9)',
  'delete from public.planning_niveaux where id = ''essai''']),
  '1', 'niveaux : un niveau inutilisé se retire');
select is(pg_temp.essai('gestion', array[
  'update public.planning_niveaux set autonome = false where id = ''occasionnel''',
  'update public.planning_niveaux set autonome = false where id = ''titulaire''']),
  'err=PL409', 'niveaux : il reste toujours un niveau qui tient une place seul');
select is(pg_temp.essai('ecriture', array[
  'insert into public.planning_niveaux (id, nom) values (''essai'', ''Essai'')']),
  'err=42501', 'niveaux : l''écriture ne les règle pas');
select is(pg_temp.essai('aucun', array['select count(*) from public.planning_niveaux']),
  '0', 'niveaux : aucun ne les lit');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_niveaux (id, nom) values (''Essai !'', ''Essai'')']),
  'err=23514', 'niveaux : un identifiant hors format est refusé');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_besoins (poste_id, jour, debut, fin, effectif, niveaux) values (:PA, 0, ''09:00'', ''17:00'', 3, ''[{"niveau": "titulaire", "nombre": 1}, {"niveau": "occasionnel", "nombre": 2}]'')'),
  pg_temp.q('select niveaux::text from public.planning_besoins where poste_id = :PA and niveaux <> ''[]''')]),
  '[{"niveau": "titulaire", "nombre": 1}, {"niveau": "occasionnel", "nombre": 2}]',
  'besoins : un nombre par niveau (1 Titulaire + 2 Dépannage)');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_besoins (poste_id, jour, debut, fin, niveaux) values (:PA, 0, ''09:00'', ''17:00'', ''[{"niveau": "licorne", "nombre": 1}]'')')]),
  'err=PL400', 'besoins : un niveau inconnu est refusé');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('insert into public.planning_besoins (poste_id, jour, debut, fin, niveaux) values (:PA, 0, ''09:00'', ''17:00'', ''[{"niveau": "titulaire", "nombre": 1}, {"niveau": "titulaire", "nombre": 2}]'')')]),
  'err=PL400', 'besoins : un niveau demandé deux fois est refusé');
select is((select coalesce(column_default, 'null') || '/' || is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = 'planning_besoins' and column_name = 'niveau_min'),
  'null/YES', 'besoins : sans niveau demandé, tout niveau autonome');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_niveaux (id, nom, ordre) values (''chef'', ''Chef'', 5)',
  pg_temp.q('insert into public.planning_besoins (poste_id, jour, debut, fin, niveaux) values (:PA, 1, ''09:00'', ''17:00'', ''[{"niveau": "chef", "nombre": 1}]'')'),
  'delete from public.planning_niveaux where id = ''chef''']),
  'err=PL409', 'niveaux : un niveau demandé par un besoin ne se retire pas');

-- ----------------------------- moments des horaires (2026-10-28) ---
select is(pg_temp.essai('gestion', array[
  'update public.planning_horaires set periode = ''middle'' where nom = ''Matin test''',
  'select periode from public.planning_horaires where nom = ''Matin test''']),
  'middle', 'moments : un horaire se range en middle');
select is(pg_temp.essai('gestion', array[
  'update public.planning_horaires set periode = ''court'' where nom = ''Matin test''']),
  'err=23503', 'moments : plus de « court », un horaire court se range d''après son début (2026-10-31)');
select is(pg_temp.essai('gestion', array[
  'update public.planning_horaires set periode = ''midi'' where nom = ''Matin test''']),
  'err=23503', 'moments : un moment inconnu est refusé');

-- ------------------------------- journée d'école (révisé le 2026-10-29) ---
-- Décision utilisateur : un jour d'école compte comme une journée de travail
-- complète (calcul dans lib/planning/regles.ts). Plus aucune durée réglable.
-- ------------------------------------ plus de code horaire (2026-10-31) ---
select hasnt_column('public', 'planning_horaires', 'code',
  'horaires : plus de code, un horaire se lit par ses heures');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_horaires (nom, debut, fin, periode) values (''Doublon test'', ''05:05'', ''13:50'', ''matin'')']),
  'err=23505', 'horaires : deux horaires aux mêmes heures sont refusés');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_horaires (nom, debut, fin) values (''Sans moment test'', ''05:10'', ''13:55'')']),
  'err=23502', 'horaires : un horaire a toujours un moment (U10)');

select hasnt_column('public', 'planning_salaries', 'heures_ecole_jour',
  'école : pas de durée réglable par personne');

-- ------------------------- repos validés comme les shifts (2026-10-31) ---
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id, epinglee) values (:S3, :F::date + 3, :R, false)'),
  pg_temp.q('select epinglee::text from public.planning_absences where salarie_id = :S3 and jour = :F::date + 3')]),
  'false', 'repos : un repos posé peut rester en proposition');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id, epinglee) values (:S3, :F::date + 3, :M, false)'),
  pg_temp.q('select epinglee::text from public.planning_absences where salarie_id = :S3 and jour = :F::date + 3')]),
  'true', 'repos : une autre absence est toujours validée');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_valider_avec_repos(:F, :S1, 2, true, jsonb_build_array(jsonb_build_object(''salarie_id'', :S1, ''jour'', 2)))'),
  pg_temp.q('select count(*) from public.planning_absences ab join public.planning_motifs m on m.id = ab.motif_id where ab.salarie_id = :S1 and ab.jour = :F::date + 2 and ab.epinglee and m.nature = ''repos''')]),
  '1', 'repos : valider un repos déduit l''écrit en base, validé');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_valider_avec_repos(:F, :S1, 0, true, jsonb_build_array(jsonb_build_object(''salarie_id'', :S1, ''jour'', 0)))'),
  pg_temp.q('select count(*) from public.planning_absences where salarie_id = :S1 and jour = :F::date')]),
  '0', 'repos : un jour qui a un shift ne devient pas un repos');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id) values (:S3, :F::date + 4, :R)'),
  pg_temp.q('select public.planning_valider_avec_repos(:F, null, null, false, null)'),
  pg_temp.q('select epinglee::text from public.planning_absences where salarie_id = :S3 and jour = :F::date + 4')]),
  'false', 'repos : tout remettre en proposition touche aussi les repos posés');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id, epinglee) values (:S3, :F::date + 3, :R, false), (:S3, :F::date + 4, :R, true)'),
  pg_temp.q('select public.planning_vider(:F, true)'),
  pg_temp.q('select string_agg((jour - :F::date)::text, '','') from public.planning_absences where salarie_id = :S3 and jour between :F::date and :F::date + 6')]),
  '4', 'repos : effacer les propositions retire le repos proposé, garde le validé');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_valider_avec_repos(:L, :S2, 3, true, jsonb_build_array(jsonb_build_object(''salarie_id'', :S2, ''jour'', 3)))')]),
  'err=PL423', 'repos : pas de repos validé sur une semaine verrouillée');
select is(pg_temp.essai('lecture', array[pg_temp.q(
  'select public.planning_valider_avec_repos(:F, null, null, true, null)')]),
  'err=42501', 'repos : la lecture ne valide rien');

-- ------------------- deux repos par semaine, même en congé (2026-11-02) ---
-- Congé toute la semaine F pour s3 : deux jours de congé deviennent des
-- repos à la validation, pas un troisième (5 jours ouvrés de congé).
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id) select :S3, :F::date + d, :M from generate_series(0, 6) d'),
  pg_temp.q('select public.planning_valider_avec_repos(:F, :S3, null, true, jsonb_build_array(jsonb_build_object(''salarie_id'', :S3, ''jour'', 5), jsonb_build_object(''salarie_id'', :S3, ''jour'', 6)))'),
  pg_temp.q('select string_agg(m.nature, '','' order by ab.jour) from public.planning_absences ab join public.planning_motifs m on m.id = ab.motif_id where ab.salarie_id = :S3 and ab.jour between :F::date and :F::date + 6')]),
  'absence,absence,absence,absence,absence,repos,repos',
  'repos : une semaine de congé garde 2 repos, écrits à la place du congé');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id) select :S3, :F::date + d, :M from generate_series(0, 6) d'),
  pg_temp.q('select public.planning_valider_avec_repos(:F, :S3, null, true, jsonb_build_array(jsonb_build_object(''salarie_id'', :S3, ''jour'', 5), jsonb_build_object(''salarie_id'', :S3, ''jour'', 6)))'),
  pg_temp.q('select public.planning_valider_avec_repos(:F, :S3, null, true, jsonb_build_array(jsonb_build_object(''salarie_id'', :S3, ''jour'', 4)))')]),
  '0', 'repos : jamais moins de 5 jours de congé dans une semaine de congé');

-- -------------------------- jours fériés rattrapés (2026-11-02) ---
-- Un JFR est posé par la génération en PROPOSITION, se valide comme un repos
-- posé, et part avec les propositions.
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id, epinglee) values (:S3, :F::date + 3, :J, false)'),
  pg_temp.q('select epinglee::text from public.planning_absences where salarie_id = :S3 and jour = :F::date + 3')]),
  'false', 'JFR : un jour férié rattrapé peut rester en proposition');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_appliquer_generation(:F, public.planning_etat_semaine(:F), 0, false, ''{}'', false, jsonb_build_array(jsonb_build_object(''salarie_id'', :S3, ''jour'', 2, ''motif_id'', :J)))'),
  pg_temp.q('select (select string_agg(epinglee::text, '','') from public.planning_absences where salarie_id = :S3 and jour = :F::date + 2) || ''/'' || (select count(*) from public.planning_affectations where lundi = :F and salarie_id = :S3)')]),
  'false/0', 'JFR : la génération l''écrit en proposition, sans shift');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'select public.planning_appliquer_generation(:F, public.planning_etat_semaine(:F), 0, false, ''{}'', false, jsonb_build_array(jsonb_build_object(''salarie_id'', :S3, ''jour'', 2, ''motif_id'', :M), jsonb_build_object(''salarie_id'', :S1, ''jour'', 0, ''motif_id'', :J)))'),
  pg_temp.q('select count(*) from public.planning_absences where salarie_id in (:S1, :S3) and jour between :F::date and :F::date + 6')]),
  '0', 'JFR : la génération n''écrit ni un autre motif, ni un JFR sur un jour qui a un shift');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id, epinglee) values (:S3, :F::date + 2, :J, false)'),
  pg_temp.q('select public.planning_valider_avec_repos(:F, :S3, 2, true, null)'),
  pg_temp.q('select epinglee::text from public.planning_absences where salarie_id = :S3 and jour = :F::date + 2')]),
  'true', 'JFR : « Valider » valide un jour férié rattrapé proposé');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id, epinglee) values (:S3, :F::date + 2, :J, false), (:S3, :F::date + 3, :J, true)'),
  pg_temp.q('select public.planning_vider(:F, true)'),
  pg_temp.q('select string_agg((jour - :F::date)::text, '','') from public.planning_absences where salarie_id = :S3 and jour between :F::date and :F::date + 6')]),
  '3', 'JFR : effacer les propositions retire le JFR proposé, garde le validé');
select is(pg_temp.essai('ecriture', array[pg_temp.q(
  'insert into public.planning_absences (salarie_id, jour, motif_id, epinglee) values (:S3, :F::date + 2, :J, false)'),
  pg_temp.q('select public.planning_appliquer_generation(:F, public.planning_etat_semaine(:F), 0, false, ''{}'', false, ''[]''::jsonb)'),
  pg_temp.q('select count(*) from public.planning_absences where salarie_id = :S3 and jour between :F::date and :F::date + 6')]),
  '0', 'JFR : une nouvelle génération efface le JFR proposé');

-- Supprimer un contrat garde le parcours d'un seul tenant (2026-11-03) :
-- S1 <- S2 <- S3 ; S2 supprimé, S3 suit désormais S1.
-- Bonne pratique RH : un contrat qui a un historique ne se supprime pas,
-- même hors d'une semaine verrouillée (S2 a un shift proposé à venir).
select is(pg_temp.essai('gestion', array[pg_temp.q('select public.planning_supprimer_salarie(:S2)')]),
  'err=PL409', 'un contrat avec un historique ne se supprime pas');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('delete from public.planning_affectations where salarie_id = :S2'),
  pg_temp.q('update public.planning_salaries set suite_de = :S1 where id = :S2'),
  pg_temp.q('update public.planning_salaries set suite_de = :S2 where id = :S3'),
  pg_temp.q('select public.planning_supprimer_salarie(:S2)'),
  pg_temp.q('select suite_de::text from public.planning_salaries where id = :S3')]),
  (select s1 from t_ids)::text, 'contrat supprimé : le suivant est rattaché au précédent');

-- Le premier contrat supprimé, deux suivants : ils restent une personne.
-- S2 en tête, S3 et Test4 le suivent ; S2 supprimé : S3 (le plus ancien)
-- devient la tête et Test4 le suit.
select is(pg_temp.essai('gestion', array[
  pg_temp.q('delete from public.planning_affectations where salarie_id = :S2'),
  pg_temp.q('update public.planning_salaries set suite_de = null, date_entree = ''2030-01-01'' where id = :S2'),
  pg_temp.q('update public.planning_salaries set suite_de = :S2, date_entree = ''2031-01-01'' where id = :S3'),
  pg_temp.q('insert into public.planning_salaries (prenom, nom, suite_de, date_entree) values (''Test4'', ''PLANNING'', :S2, ''2032-01-01'')'),
  pg_temp.q('select public.planning_supprimer_salarie(:S2)'),
  pg_temp.q('select coalesce(s.suite_de::text, ''tete'') || ''/'' || (select (t.suite_de = :S3)::text from public.planning_salaries t where t.prenom = ''Test4'' and t.nom = ''PLANNING'') from public.planning_salaries s where s.id = :S3')]),
  'tete/true', 'premier contrat supprimé : le plus ancien suivant devient la tête, l''autre le suit');

-- ------------------- motifs, équité, jours fériés en plus (2026-11-06) ---
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_motifs (code, nom, nature, decompte, role) values (''XK'', ''Deuxième JFR'', ''absence'', true, ''ferie_rattrape'')']),
  'err=23505', 'motifs : un seul motif par rôle');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_motifs (code, nom, nature, decompte, role) values (''XL'', ''Repos absence'', ''absence'', true, ''repos_defaut'')']),
  'err=23514', 'motifs : le repos du planning est un motif de nature repos');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_motifs (code, nom, role) values (''XM'', ''Rôle inconnu'', ''chef'')']),
  'err=23514', 'motifs : un rôle inconnu est refusé');
select is(pg_temp.essai('gestion', array[
  pg_temp.q('update public.planning_motifs set code = ''QQ'', nom = ''Rattrapé renommé'' where id = :J'),
  pg_temp.q('insert into public.planning_absences (salarie_id, jour, motif_id, epinglee) values (:S3, :F::date + 3, :J, false)'),
  pg_temp.q('select epinglee::text from public.planning_absences where salarie_id = :S3 and jour = :F::date + 3')]),
  'false', 'motifs : un jour férié rattrapé renommé garde son rôle (proposition permise)');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_motifs (code, nom, icone, libre_weekend, reserve_forfait) values (''XN'', ''Avec icône'', ''conge'', true, true)',
  'select icone || ''/'' || libre_weekend || ''/'' || reserve_forfait from public.planning_motifs where code = ''XN''']),
  'conge/true/true', 'motifs : icône, week-end libre et forfait se règlent');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_motifs (code, nom, icone) values (''XO'', ''Icône inconnue'', ''licorne'')']),
  'err=23514', 'motifs : une icône inconnue est refusée');
select is((select string_agg(column_default, ',' order by column_name)
             from information_schema.columns
            where table_schema = 'public' and table_name = 'planning_motifs'
              and column_name in ('libre_weekend', 'reserve_forfait')),
  'false,false', 'motifs : un motif neuf ne libère pas le week-end et n''est pas réservé');
select is(pg_temp.essai('gestion', array[
  'update public.planning_reglages set weekend_jours = ''{4,5}'', weekend_nuit_veille = false, equite_criteres = ''{soirs,nuits}'', equite_semaines = 6 where id = 1',
  'select weekend_jours::text || ''/'' || weekend_nuit_veille || ''/'' || equite_criteres::text || ''/'' || equite_semaines from public.planning_reglages where id = 1']),
  '{4,5}/false/{soirs,nuits}/6', 'équité : la gestion règle le week-end, les critères et les semaines');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set weekend_jours = ''{7}'' where id = 1']),
  'err=23514', 'équité : un jour du week-end hors de la semaine est refusé');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set equite_criteres = ''{licornes}'' where id = 1']),
  'err=23514', 'équité : un critère inconnu est refusé');
select is(pg_temp.essai('gestion', array['update public.planning_reglages set equite_semaines = 2, semaines_en_plus_alerte = 3 where id = 1']),
  'err=23514', 'équité : l''alerte des heures en plus ne compte pas plus de semaines que le partage');
select is(pg_temp.essai('ecriture', array['update public.planning_reglages set equite_semaines = 6 where id = 1']),
  '0', 'équité : l''écriture ne la règle pas');
select is((select weekend_jours::text || '/' || weekend_nuit_veille || '/' || equite_criteres::text || '/' || equite_semaines
             from public.planning_reglages where id = 1),
  '{5,6}/true/{weekends,soirs,matins_tot}/4', 'équité : les défauts sont ceux de l''hôtel');
select is((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'planning_postes'
              and column_name = 'indispensable'),
  'false', 'postes : un poste neuf n''est pas indispensable');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_feries (jour, nom, recurrent) values (''2031-05-17'', ''Fête locale test'', true)',
  'select nom || ''/'' || recurrent from public.planning_feries where jour = ''2031-05-17''']),
  'Fête locale test/true', 'jours fériés en plus : la gestion en ajoute');
select is(pg_temp.essai('gestion', array[
  'insert into public.planning_feries (jour, nom) values (''2031-05-18'', ''Un'')',
  'insert into public.planning_feries (jour, nom) values (''2031-05-18'', ''Deux'')']),
  'err=23505', 'jours fériés en plus : une date une seule fois');
select is(pg_temp.essai('ecriture', array['insert into public.planning_feries (jour, nom) values (''2031-05-19'', ''Essai'')']),
  'err=42501', 'jours fériés en plus : l''écriture n''en ajoute pas');
select is(pg_temp.essai('aucun', array['select count(*) from public.planning_feries']),
  '0', 'jours fériés en plus : aucun ne les lit');
select is(pg_temp.essai('lecture', array['select count(*) from public.planning_feries']),
  (select count(*)::text from public.planning_feries), 'jours fériés en plus : la lecture les lit');

-- Une génération pose ses repos en proposition (2026-11-03) : un motif de
-- nature repos est accepté, comme un JFR, jamais validé d'office.
select is(pg_temp.essai('ecriture', array[
  pg_temp.q('select public.planning_appliquer_generation(:F, public.planning_etat_semaine(:F), 0, false, ''{}'', true, jsonb_build_array(jsonb_build_object(''salarie_id'', :S3, ''jour'', 4, ''motif_id'', :R)))'),
  pg_temp.q('select string_agg(epinglee::text, '','') from public.planning_absences where salarie_id = :S3 and jour = :F::date + 4 and motif_id = :R')]),
  'false', 'génération : un repos se pose en proposition');

select * from finish();
rollback;
