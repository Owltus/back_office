-- =============================================================================
-- 04_classeur_acces.test.sql — ACCÈS PAR CLASSEUR sur la vraie base locale.
-- Plan environnement-dev-docker-2026-10-12, étape 10 (port pgTAP de
-- `supabase/verif_classeur_acces.sql`, étendu en matrice).
--
-- Règle (2026-11-16, migration `20261116120000_classeur_visibilite`) : TYPE
-- du classeur. Public : la page décide (lecture, écriture, gestion). Privé :
-- son auteur seul (lecture si sa page est en lecture, gestion sinon). Gestion :
-- la gestion de la page seule. L'admin : tout. L'oracle `pg_temp.niveau`
-- applique cette règle à une SPÉCIFICATION (t_spec) qui sert aussi à poser les
-- données ; il n'appelle aucune fonction de la base.
--
-- Partie 2 : confrontation du simulateur `src/lib/classeur/test/
-- simulateurSupabase.ts` à la base (scénarios S1…S8, écarts en commentaire).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table t_compte (compte text primary key, uid uuid, ordre int, page int);
insert into t_compte
select c.compte, coalesce(p.id, c.repli), c.ordre, c.page
  from (values
    ('admin',       'admin@exemple.test',     null::uuid, 1, 3),
    ('gestion',     'gestion@exemple.test',   null, 2, 3),
    ('ecriture',    'ecriture@exemple.test',  null, 3, 2),
    ('lecture',     'lecture@exemple.test',   null, 4, 1),
    ('aucun',       'aucun@exemple.test',     null, 5, 0),
    ('reception',   'reception@exemple.test', null, 6, 1),
    ('sans_profil', null, 'b0000000-0000-4000-8000-0000000000ff', 7, 0),
    ('anon',        null, null, 8, 0)
  ) as c(compte, email, repli, ordre, page)
  left join public.profiles p on p.email = c.email;

-- Spécification des classeurs (A, B, C = classeurs 1, 2, 3 du seed ; D, E, F créés).
create temp table t_spec (cle text primary key, createur text, visibilite text);
insert into t_spec values
  ('A', 'admin', 'public'), ('B', 'admin', 'gestion'), ('C', 'admin', 'prive'),
  ('D', 'ecriture', 'public'), ('E', 'ecriture', 'prive'), ('F', 'gestion', 'prive');

-- Oracle : 'aucun' | 'lecture' | 'ecriture' | 'gestion'.
create function pg_temp.niveau(p_compte text, p_cle text) returns text
language plpgsql as $$
declare v_page int; s record;
begin
  select page into v_page from t_compte where compte = p_compte;
  if coalesce(v_page, 0) = 0 then return 'aucun'; end if;
  if p_compte = 'admin' then return 'gestion'; end if;
  select * into s from t_spec where cle = p_cle;
  if s.visibilite = 'prive' then
    if s.createur <> p_compte then return 'aucun'; end if;
    return case when v_page = 1 then 'lecture' else 'gestion' end;
  end if;
  if s.visibilite = 'gestion' then
    return case when v_page = 3 then 'gestion' else 'aucun' end;
  end if;
  return case v_page when 3 then 'gestion' when 2 then 'ecriture' else 'lecture' end;
end $$;

create function pg_temp.rang(p_niveau text) returns int language sql as $$
  select case p_niveau when 'lecture' then 1 when 'ecriture' then 2 when 'gestion' then 3 else 0 end $$;

create function pg_temp.en_tant_que(p_compte text) returns void
language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  if p_compte is null then return; end if;
  if p_compte = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    return;
  end if;
  select uid into v from t_compte where compte = p_compte;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.essai(p_compte text, p_sql text, p_prep text default null)
returns text language plpgsql as $$
declare v_n bigint; v_res text;
begin
  begin
    if p_prep is not null then execute p_prep; end if;
    perform pg_temp.en_tant_que(p_compte);
    if p_sql ~* '^\s*(select|with)' then
      execute p_sql into v_n;
    else
      execute p_sql;
      get diagnostics v_n = row_count;
    end if;
    v_res := case when v_n > 0 then 'ok' else 'zero' end;
    raise exception using errcode = 'P0T01';
  exception
    when sqlstate 'P0T01' then null;
    when others then v_res := 'err=' || sqlstate;
  end;
  return v_res;
end $$;

-- ---------------------------------------------------------------- données ---
create temp table t_cl (cle text primary key, id bigint, ch bigint, doc bigint, obj text);

set local session_replication_role = replica;
insert into auth.users (id, email) values ('b0000000-0000-4000-8000-0000000000ff', 'revoque@exemple.test');
insert into t_cl (cle, id) values ('A', 1), ('B', 2), ('C', 3);
with n as (
  insert into public.classeur_classeurs (name, created_by, visibilite)
  select 'Essai ' || s.cle, (select uid from t_compte where compte = s.createur), s.visibilite
    from t_spec s where s.cle in ('D', 'E', 'F') order by s.cle
  returning id, name)
insert into t_cl (cle, id) select right(name, 1), id from n;
update public.classeur_classeurs c set visibilite = s.visibilite,
       created_by = (select uid from t_compte where compte = s.createur), deleted_at = null
  from t_spec s join t_cl l using (cle) where c.id = l.id;
-- Les exceptions par personne ne sont plus lues : on en pose une pour le prouver.
delete from public.classeur_acces where classeur_id in (select id from t_cl);
insert into public.classeur_acces (classeur_id, user_id, niveau)
select l.id, c.uid, 'ecriture' from t_cl l, t_compte c where l.cle = 'C' and c.compte = 'lecture';

-- Un chapitre + un élément de chaque famille + version, image, points, fichier.
do $$
declare l record; v_ch bigint; v_doc bigint; v_obj text;
begin
  for l in select * from t_cl loop
    insert into public.classeur_chapters (classeur_id, label) values (l.id, 'Chapitre ' || l.cle)
      returning id into v_ch;
    insert into public.classeur_documents (chapter_id, title, content) values (v_ch, 'Doc ' || l.cle, 'texte')
      returning id into v_doc;
    insert into public.classeur_tracking_sheets (chapter_id, title, periodicite_id)
      values (v_ch, 'Suivi', (select min(id) from public.classeur_periodicites));
    insert into public.classeur_signature_sheets (chapter_id, title) values (v_ch, 'Signatures');
    insert into public.classeur_intercalaires (chapter_id, title) values (v_ch, 'Intercalaire');
    insert into public.classeur_document_versions (document_id, classeur_id, title, content, origine)
      values (v_doc, l.id, 'Doc', 'texte', 'creation');
    v_obj := l.id || '/' || gen_random_uuid() || '.webp';
    insert into public.classeur_images (classeur_id, chemin, nom) values (l.id, v_obj, 'img');
    insert into storage.objects (bucket_id, name) values ('classeur-images', v_obj);
    insert into public.classeur_merge_history (classeur_id, snapshot, kind) values
      (l.id, '{}'::jsonb, 'auto'), (l.id, '{}'::jsonb, 'manuel');
    update t_cl set ch = v_ch, doc = v_doc, obj = v_obj where cle = l.cle;
  end loop;
end $$;
set local session_replication_role = origin;

-- ------------------------------------------------------------- opérations ---
-- besoin : niveau effectif requis (lecture / ecriture / gestion / jamais).
-- refus : 'zero' (0 ligne) ou 'err' (42501) ; 'err_si_ecriture' = erreur pour
-- qui a l'écriture (garde par trigger ou WITH CHECK), 0 ligne sinon.
create temp table t_op (ord serial, nom text, besoin text, refus text, sql text, prep text);
insert into t_op (nom, besoin, refus, sql, prep) values
('lire le classeur',            'lecture', 'zero', 'select count(*) from public.classeur_classeurs where id = {c}', null),
('lire ses chapitres',          'lecture', 'zero', 'select count(*) from public.classeur_chapters where classeur_id = {c}', null),
('lire ses documents',          'lecture', 'zero', 'select count(*) from public.classeur_documents where chapter_id = {ch}', null),
('lire ses feuilles de suivi',  'lecture', 'zero', 'select count(*) from public.classeur_tracking_sheets where chapter_id = {ch}', null),
('lire ses feuilles de signature','lecture','zero', 'select count(*) from public.classeur_signature_sheets where chapter_id = {ch}', null),
('lire ses intercalaires',      'lecture', 'zero', 'select count(*) from public.classeur_intercalaires where chapter_id = {ch}', null),
('lire ses versions',           'lecture', 'zero', 'select count(*) from public.classeur_document_versions where classeur_id = {c}', null),
('lire sa médiathèque',         'lecture', 'zero', 'select count(*) from public.classeur_images where classeur_id = {c}', null),
('lire ses points de restauration','lecture','zero','select count(*) from public.classeur_merge_history where classeur_id = {c}', null),
('lire ses fichiers (storage)', 'lecture', 'zero', $q$select count(*) from storage.objects where bucket_id = 'classeur-images' and name = '{obj}'$q$, null),
('créer un chapitre',           'ecriture', 'err', $q$insert into public.classeur_chapters (classeur_id, label) values ({c}, 'T')$q$, null),
('modifier un chapitre',        'ecriture', 'zero', $q$update public.classeur_chapters set label = 'T' where id = {ch}$q$, null),
('créer un document',           'ecriture', 'err', $q$insert into public.classeur_documents (chapter_id, title) values ({ch}, 'T')$q$, null),
('modifier un document',        'ecriture', 'zero', $q$update public.classeur_documents set content = content || 'x' where id = {doc}$q$, null),
('supprimer (doucement) un document','ecriture','zero', $q$update public.classeur_documents set deleted_at = now() where id = {doc}$q$, null),
('supprimer physiquement un document','jamais','zero', 'delete from public.classeur_documents where id = {doc}', null),
('créer une feuille de suivi',  'ecriture', 'err', $q$insert into public.classeur_tracking_sheets (chapter_id, title, periodicite_id) values ({ch}, 'T', 1)$q$, null),
('créer une feuille de signature','ecriture','err', $q$insert into public.classeur_signature_sheets (chapter_id, title) values ({ch}, 'T')$q$, null),
('créer un intercalaire',       'ecriture', 'err', $q$insert into public.classeur_intercalaires (chapter_id, title) values ({ch}, 'T')$q$, null),
('créer une fiche d''image',    'ecriture', 'err', $q$insert into public.classeur_images (classeur_id, chemin, nom) values ({c}, '{c}/' || gen_random_uuid() || '.webp', 'T')$q$, null),
('renommer une image',          'ecriture', 'zero', $q$update public.classeur_images set nom = 'T' where chemin = '{obj}'$q$, null),
('déposer un fichier (storage)','ecriture', 'err', $q$insert into storage.objects (bucket_id, name) values ('classeur-images', '{c}/' || gen_random_uuid() || '.webp')$q$, null),
('retirer un fichier (storage)','ecriture', 'zero', $q$delete from storage.objects where bucket_id = 'classeur-images' and name = '{obj}'$q$,
   $q$select set_config('storage.allow_delete_query', 'true', true)$q$),
('prendre un point de restauration','ecriture','err', $q$insert into public.classeur_merge_history (classeur_id, snapshot, kind) values ({c}, '{}'::jsonb, 'manuel')$q$, null),
('élaguer un point auto',       'ecriture', 'zero', $q$delete from public.classeur_merge_history where classeur_id = {c} and kind = 'auto'$q$, null),
('supprimer un point manuel',   'gestion',  'zero', $q$delete from public.classeur_merge_history where classeur_id = {c} and kind = 'manuel'$q$, null),
('renommer le classeur',        'ecriture', 'zero', $q$update public.classeur_classeurs set name = 'T' where id = {c}$q$, null),
('supprimer (doucement) le classeur','gestion','err_si_ecriture', $q$update public.classeur_classeurs set deleted_at = now() where id = {c}$q$, null),
('réordonner le classeur',      'gestion',  'err_si_ecriture', $q$update public.classeur_classeurs set sort_order = sort_order + 1 where id = {c}$q$, null),
('supprimer physiquement le classeur','gestion','zero', 'delete from public.classeur_classeurs where id = {c}', null);

-- Deux commandes, MÊME compte, même sous-transaction annulée (l'effet d'un
-- trigger AFTER n'est visible qu'à la commande suivante).
create function pg_temp.essai_suite(p_compte text, p_ecrire text, p_compter text)
returns text language plpgsql as $$
declare v_n bigint; v_res text;
begin
  begin
    perform pg_temp.en_tant_que(p_compte);
    execute p_ecrire;
    execute p_compter into v_n;
    v_res := case when v_n > 0 then 'ok' else 'zero' end;
    raise exception using errcode = 'P0T01';
  exception
    when sqlstate 'P0T01' then null;
    when others then v_res := 'err=' || sqlstate;
  end;
  return v_res;
end $$;

create function pg_temp.sql_de(p_sql text, l t_cl) returns text language sql as $$
  select replace(replace(replace(replace(p_sql, '{c}', l.id::text), '{ch}', l.ch::text),
                 '{doc}', l.doc::text), '{obj}', l.obj) $$;

create function pg_temp.attendu(o t_op, p_compte text, p_cle text) returns text
language plpgsql as $$
declare n int := pg_temp.rang(pg_temp.niveau(p_compte, p_cle));
begin
  if p_compte = 'anon' then
    -- storage.objects garde les privilèges Supabase par défaut pour anon : la
    -- RLS seule filtre (0 ligne ; un insert est refusé 42501).
    return case when o.sql like '%storage.objects%' and o.refus <> 'err' then 'zero' else 'err=42501' end;
  end if;
  if o.besoin <> 'jamais' and n >= pg_temp.rang(o.besoin) then return 'ok'; end if;
  return case o.refus
    when 'err' then 'err=42501'
    when 'err_si_ecriture' then case when n >= 2 then 'err=42501' else 'zero' end
    else 'zero' end;
end $$;

create function pg_temp.matrice() returns setof text language plpgsql as $$
declare o t_op; l t_cl; c record;
begin
  for o in select * from t_op order by ord loop
    for l in select * from t_cl order by cle loop
      for c in select * from t_compte order by ordre loop
        return next is(
          pg_temp.essai(c.compte, pg_temp.sql_de(o.sql, l), o.prep),
          pg_temp.attendu(o, c.compte, l.cle),
          format('classeur %s (%s) : %s — %s', l.cle, pg_temp.niveau(c.compte, l.cle), o.nom, c.compte));
      end loop;
    end loop;
  end loop;
end $$;

-- Déplacer un document vers le chapitre du classeur B (gestion) : écriture
-- exigée des DEUX côtés ; écriture à l'origine seulement → WITH CHECK → 42501.
create function pg_temp.deplacements() returns setof text language plpgsql as $$
declare l t_cl; c record; v_cible bigint := (select ch from t_cl where cle = 'B'); v_att text;
begin
  for l in select * from t_cl where cle <> 'B' order by cle loop
    for c in select * from t_compte order by ordre loop
      v_att := case
        when c.compte = 'anon' then 'err=42501'
        when pg_temp.rang(pg_temp.niveau(c.compte, l.cle)) < 2 then 'zero'
        when pg_temp.rang(pg_temp.niveau(c.compte, 'B')) < 2 then 'err=42501'
        else 'ok' end;
      return next is(
        pg_temp.essai(c.compte, format('update public.classeur_documents set chapter_id = %s where id = %s', v_cible, l.doc)),
        v_att, format('déplacer un document de %s vers B — %s', l.cle, c.compte));
    end loop;
  end loop;
end $$;

-- Changer le TYPE ou l'AUTEUR d'un classeur (garde `classeur_garde`).
create function pg_temp.vis(p_cle text) returns bigint language sql as $$
  select id from t_cl where cle = p_cle $$;
create function pg_temp.uid(p_compte text) returns uuid language sql as $$
  select uid from t_compte where compte = p_compte $$;
grant select on t_cl, t_compte to authenticated;

select plan(
  (select count(*)::int from t_op) * 6 * 8   -- matrice
  + 5 * 8                                   -- déplacements
  + 22                                      -- cas nommés (socle)
  + 24);                                    -- type et auteur

select * from pg_temp.matrice();
select * from pg_temp.deplacements();

-- ----------------------------------------------------- type et auteur ---
select is(pg_temp.essai('ecriture', format($q$update public.classeur_classeurs set visibilite = 'prive' where id = %s$q$, pg_temp.vis('D'))),
  'ok', 'type : l''auteur passe son public en privé');
select is(pg_temp.essai('ecriture', format($q$update public.classeur_classeurs set visibilite = 'public' where id = %s$q$, pg_temp.vis('E'))),
  'ok', 'type : l''auteur passe son privé en public');
select is(pg_temp.essai('ecriture', format($q$update public.classeur_classeurs set visibilite = 'prive' where id = %s$q$, pg_temp.vis('A'))),
  'err=42501', 'type : un compte en écriture ne range pas le public d''un autre en privé');
select is(pg_temp.essai('ecriture', format($q$update public.classeur_classeurs set visibilite = 'gestion' where id = %s$q$, pg_temp.vis('D'))),
  'err=42501', 'type : un compte en écriture ne range rien dans Gestion');
select is(pg_temp.essai('lecture', format($q$update public.classeur_classeurs set visibilite = 'prive' where id = %s$q$, pg_temp.vis('A'))),
  'zero', 'type : un compte en lecture ne change rien (0 ligne)');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set visibilite = 'gestion' where id = %s$q$, pg_temp.vis('A'))),
  'ok', 'type : la gestion range un public dans Gestion');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set visibilite = 'prive' where id = %s$q$, pg_temp.vis('D'))),
  'err=42501', 'type : la gestion ne se cache pas un classeur (privé d''un autre : la ligne neuve doit rester lisible)');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set visibilite = 'prive', created_by = auth.uid() where id = %s$q$, pg_temp.vis('D'))),
  'ok', 'type : la gestion prend un public dans ses privés');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set visibilite = 'public' where id = %s$q$, pg_temp.vis('C'))),
  'zero', 'type : la gestion ne voit pas le privé d''un autre (0 ligne)');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set visibilite = 'gestion' where id = %s$q$, pg_temp.vis('F'))),
  'ok', 'type : la gestion range son propre privé dans Gestion');
select is(pg_temp.essai('admin', format($q$update public.classeur_classeurs set visibilite = 'gestion' where id = %s$q$, pg_temp.vis('E'))),
  'err=23514', 'type : vers Gestion, un auteur sans la gestion est refusé');
select is(pg_temp.essai('admin', format($q$update public.classeur_classeurs set visibilite = 'public' where id = %s$q$, pg_temp.vis('E'))),
  'ok', 'type : l''admin déplace le privé d''un autre');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set created_by = '%s' where id = %s$q$, pg_temp.uid('ecriture'), pg_temp.vis('A'))),
  'ok', 'auteur : la gestion donne un public à un compte en écriture');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set created_by = '%s' where id = %s$q$, pg_temp.uid('ecriture'), pg_temp.vis('B'))),
  'err=23514', 'auteur : un classeur de gestion n''a qu''un auteur qui a la gestion');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set created_by = '%s' where id = %s$q$, pg_temp.uid('lecture'), pg_temp.vis('A'))),
  'ok', 'auteur : la gestion dédie un public à un compte en lecture');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set created_by = '%s' where id = %s$q$, pg_temp.uid('lecture'), pg_temp.vis('B'))),
  'err=23514', 'auteur : un compte en lecture n''a pas de classeur de gestion');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set created_by = '%s' where id = %s$q$, pg_temp.uid('aucun'), pg_temp.vis('A'))),
  'err=23514', 'auteur : un compte sans la page ne peut pas être l''auteur');
select is(pg_temp.essai('gestion', format($q$update public.classeur_classeurs set created_by = null where id = %s$q$, pg_temp.vis('A'))),
  'err=23514', 'auteur : jamais vide');
select is(pg_temp.essai('ecriture', format($q$update public.classeur_classeurs set created_by = '%s' where id = %s$q$, pg_temp.uid('gestion'), pg_temp.vis('D'))),
  'ok', 'auteur : l''auteur donne son classeur');
select is(pg_temp.essai('ecriture', format($q$update public.classeur_classeurs set created_by = '%s' where id = %s$q$, pg_temp.uid('ecriture'), pg_temp.vis('A'))),
  'err=42501', 'auteur : un compte en écriture ne prend pas le classeur d''un autre');
select is(pg_temp.essai('ecriture', $q$insert into public.classeur_classeurs (name, visibilite) values ('T', 'gestion')$q$),
  'err=42501', 'création : un compte en écriture ne crée pas un classeur de gestion');
select is(pg_temp.essai('ecriture',
  $q$with i as (insert into public.classeur_classeurs (name, visibilite) values ('T', 'prive') returning visibilite, created_by)
     select count(*) from i where visibilite = 'prive' and created_by = auth.uid()$q$),
  'ok', 'création : un compte en écriture crée son privé et le relit');
select is(pg_temp.essai('gestion',
  $q$with i as (insert into public.classeur_classeurs (name, visibilite) values ('T', 'gestion') returning visibilite)
     select count(*) from i where visibilite = 'gestion'$q$),
  'ok', 'création : la gestion crée un classeur de gestion');
select is((select count(*)::int from pg_trigger where tgname = 'audit_classeur_visibilite'), 1,
  'journal : le changement de type ou d''auteur est journalisé (trigger présent)');

-- ------------------------------------------------- cas repris de la verif ---
select is((select count(*)::int from t_compte where uid is not null), 7, 'comptes du seed présents');
select is(pg_temp.essai('lecture', 'select count(*) from public.classeur_periodicites'), 'ok', 'périodicités lisibles au rang lecture');
select is(pg_temp.essai('aucun', 'select count(*) from public.classeur_periodicites'), 'zero', 'périodicités invisibles sans droit de page');
select is(pg_temp.essai('lecture', 'select count(*) from public.classeur_personnes()'), 'ok', 'liste des personnes : tout compte qui a la page');

-- Création hors gestion : fin de liste, jamais supprimé.
select is(pg_temp.essai('ecriture',
  $q$with i as (insert into public.classeur_classeurs (name, sort_order, deleted_at)
                values ('T', -5, now()) returning visibilite, sort_order, deleted_at)
     select count(*) from i where visibilite = 'public' and deleted_at is null
       and sort_order = $q$ || (select max(sort_order) + 1 from public.classeur_classeurs)),
  'ok', 'création hors gestion : public par défaut, fin de liste, non supprimé');
select is(pg_temp.essai('gestion',
  $q$with i as (insert into public.classeur_classeurs (name, visibilite) values ('T', 'prive') returning visibilite)
     select count(*) from i where visibilite = 'prive'$q$),
  'ok', 'création par la gestion : « privé » respecté');
select is(pg_temp.essai('lecture', $q$insert into public.classeur_classeurs (name) values ('T')$q$),
  'err=42501', 'création : refusée au rang lecture');
select is(pg_temp.essai('ecriture',
  $q$with i as (insert into public.classeur_classeurs (name) values ('T') returning id),
          u as (select id from i)
     select count(*) from u$q$),
  'ok', 'création : le créateur relit son classeur (policy de lecture sur les colonnes de la ligne)');
-- Durcissement du 2026-09-28.
select is(pg_temp.essai('ecriture', $q$insert into public.classeur_classeurs (id, name) values (987654321, 'T')$q$),
  'err=428C9', 'identifiant de classeur choisi : refusé (generated always)');
select is(pg_temp.essai('gestion', $q$insert into public.classeur_documents (id, chapter_id, title) values (987654321, 1, 'T')$q$),
  'err=428C9', 'identifiant de document choisi : refusé, même à la gestion');
select is(pg_temp.essai('ecriture',
  format($q$insert into public.classeur_images (classeur_id, chemin, nom) values (%s, '%s/' || gen_random_uuid() || '.webp', 'T')$q$,
         (select id from t_cl where cle = 'A'), (select id from t_cl where cle = 'D'))),
  'err=23514', 'fiche d''image dans le dossier d''un autre classeur : refusée (CHECK)');
select is(pg_temp.essai('ecriture',
  format($q$insert into storage.objects (bucket_id, name) values ('classeur-images', '%s/' || gen_random_uuid() || '.png')$q$,
         (select id from t_cl where cle = 'A'))),
  'err=42501', 'storage : extension autre que webp refusée');
select is(pg_temp.essai('ecriture',
  format($q$insert into storage.objects (bucket_id, name) values ('classeur-images', '%s/sous/' || gen_random_uuid() || '.webp')$q$,
         (select id from t_cl where cle = 'A'))),
  'err=42501', 'storage : sous-dossier refusé');
select is(pg_temp.essai('admin',
  format($q$update storage.objects set name = name where name = '%s'$q$, (select obj from t_cl where cle = 'A'))),
  'zero', 'storage : aucune policy UPDATE (un upload upsert est refusé même à la gestion)');

-- ------------------------------------------- confrontation au simulateur ---
-- S1 (simulateur : `politique` using → 0 ligne sans erreur ; check → 42501) :
-- un update dont la NOUVELLE ligne sort des droits → 42501, RIEN écrit.
select is(pg_temp.essai('ecriture',
  format('update public.classeur_chapters set classeur_id = %s where id = %s',
         (select id from t_cl where cle = 'B'), (select ch from t_cl where cle = 'A'))),
  'err=42501', 'S1 : update vers un classeur non modifiable → 42501 (= simulateur)');

-- S2 (simulateur `modifier` : updated_at posé SAUF s'il est fourni et différent) :
select is(pg_temp.essai('ecriture',
  format($q$with u as (update public.classeur_documents set content = 'y', updated_at = '2026-01-01T00:00:00Z'
                       where id = %s returning updated_at) select count(*) from u where updated_at = '2026-01-01T00:00:00Z'$q$,
         (select doc from t_cl where cle = 'A'))),
  'ok', 'S2 : updated_at fourni respecté (= simulateur)');
-- S3 (ÉCART) : un updated_at fourni dans le FUTUR (> now() + 5 min) est
-- ramené à now() par `classeur_stamp` ; le simulateur le garde tel quel.
select is(pg_temp.essai('ecriture',
  format($q$with u as (update public.classeur_documents set content = 'y', updated_at = now() + interval '1 day'
                       where id = %s returning updated_at) select count(*) from u where updated_at <= now()$q$,
         (select doc from t_cl where cle = 'A'))),
  'ok', 'S3 : updated_at futur ramené à now() (ÉCART : le simulateur ne borne pas)');
-- S4 (ÉCART) : tout enregistrement d'un document écrit une version (trigger
-- `classeur_document_version`, + « etat_initial » la 1re fois) ; le simulateur
-- n'en écrit aucune.
select is(pg_temp.essai_suite('ecriture',
  format($q$update public.classeur_documents set content = 'nouveau' where id = %s$q$, (select doc from t_cl where cle = 'A')),
  format($q$select count(*) from public.classeur_document_versions where document_id = %s and content = 'nouveau' and origine = 'enregistrement'$q$,
         (select doc from t_cl where cle = 'A'))),
  'ok', 'S4 : un enregistrement crée une version lisible (ÉCART : absent du simulateur)');
-- S5 (= simulateur, `versionsSuivent`) : les versions suivent un document
-- déplacé vers un autre classeur.
select is(pg_temp.essai_suite('gestion',
  format('update public.classeur_documents set chapter_id = %s where id = %s',
         (select ch from t_cl where cle = 'B'), (select doc from t_cl where cle = 'A')),
  format('select count(*) from public.classeur_document_versions where document_id = %s and classeur_id = %s',
         (select doc from t_cl where cle = 'A'), (select id from t_cl where cle = 'B'))),
  'ok', 'S5 : les versions suivent le document déplacé (= simulateur)');
-- S6 (ÉCART) : `inserer` du simulateur garde un `id` fourni ; la base le
-- refuse (428C9, identité « generated always ») — cf. les deux tests
-- « identifiant choisi » plus haut. Idem pour `classeur_garde` (création hors
-- gestion forcée à lecture / fin de liste) : le simulateur n'a pas cette garde.
-- S7 (ÉCART) : `upsert` du simulateur apparie sur `id` SEULEMENT et ignore
-- `onConflict` ; `definirAcces` (service.ts) fait un upsert sur
-- (classeur_id, user_id) SANS id : la base MET À JOUR la ligne existante, le
-- simulateur en insérerait une SECONDE.
select is(pg_temp.essai_suite('gestion',
  format($q$insert into public.classeur_acces (classeur_id, user_id, niveau) values (%s, '%s', 'aucun')
            on conflict (classeur_id, user_id) do update set niveau = excluded.niveau$q$,
         (select id from t_cl where cle = 'A'), (select uid from t_compte where compte = 'lecture')),
  format($q$select count(*) from public.classeur_acces where classeur_id = %s and user_id = '%s' having count(*) = 1 and min(niveau) = 'aucun'$q$,
         (select id from t_cl where cle = 'A'), (select uid from t_compte where compte = 'lecture'))),
  'ok', 'S7 : upsert sur (classeur_id, user_id) met à jour, sans doublon (ÉCART : le simulateur dupliquerait)');
-- S8 (ÉCART de défaut) : aucune policy DELETE sur les éléments : une
-- suppression physique rend 0 ligne même à la gestion (matrice « supprimer
-- physiquement un document ») ; le simulateur supprime tant qu'on ne lui a
-- pas posé de `politique`/`refuser` pour (table, delete).
select is(pg_temp.essai('admin', format('delete from public.classeur_chapters where id = %s', (select ch from t_cl where cle = 'A'))),
  'zero', 'S8 : suppression physique d''un chapitre : 0 ligne même pour l''admin');
-- S9 (= simulateur) : le stamp n'écrase pas un updated_at fourni à l'insertion
-- (fusion JSON), et pose created_by = auth.uid() (le simulateur ne pose pas
-- created_by : écart sans effet sur le service, qui ne le lit pas).
select is(pg_temp.essai('ecriture',
  format($q$with i as (insert into public.classeur_chapters (classeur_id, label, updated_at, created_by)
                       values (%s, 'T', '2026-01-01T00:00:00Z', '%s') returning updated_at, created_by)
     select count(*) from i where updated_at = '2026-01-01T00:00:00Z' and created_by = auth.uid()$q$,
         (select id from t_cl where cle = 'A'), (select uid from t_compte where compte = 'admin'))),
  'ok', 'S9 : updated_at fourni gardé à l''insertion, created_by forcé à l''appelant');

select * from finish();
rollback;

