-- =============================================================================
-- verif_classeur_acces.sql — MATRICE des droits par classeur, rejouable.
-- Règles : TYPE du classeur (migration 20261116120000_classeur_visibilite,
-- 2026-11-16) — public (la page décide), privé (son auteur seul), gestion (la
-- gestion de la page seule), l'admin partout. Remplace l'accès pour tous et
-- les exceptions par personne du 2026-09-28.
--
-- Tout se passe dans UN bloc qui se termine TOUJOURS par une exception :
-- la transaction est annulée, rien ne reste (droits de page simulés,
-- classeurs de test, modifications). Le résultat sort dans le message
-- d'erreur : `RESULTAT OK n/n` ou la liste des écarts.
--
-- Profils simulés : quatre comptes NON admin existants, choisis au lancement
-- (les quatre premiers par date de création), à qui l'on pose un droit de
-- page le temps du test ; l'admin (profiles.role = 'admin').
-- Classeurs : les deux premiers classeurs existants (A public, B privé de
-- l'admin), un classeur de gestion et un privé créés pendant le test.
-- =============================================================================

do $$
declare
  v_admin uuid;
  v_lect  uuid;   -- page lecture
  v_ecri  uuid;   -- page ecriture
  v_sans  uuid;   -- aucun droit de page
  v_gest  uuid;   -- page gestion (pas admin)
  v_a bigint; v_b bigint; v_g bigint; v_neuf bigint;
  v_n int;
  v_txt text;
  ok int := 0;
  ko text[] := '{}';
  attendu_err boolean;

begin
  select id into v_admin from public.profiles where role = 'admin' order by created_at limit 1;
  select id into v_lect from public.profiles where role <> 'admin' order by created_at limit 1;
  select id into v_ecri from public.profiles where role <> 'admin' order by created_at offset 1 limit 1;
  select id into v_sans from public.profiles where role <> 'admin' order by created_at offset 2 limit 1;
  select id into v_gest from public.profiles where role <> 'admin' order by created_at offset 3 limit 1;
  select id into v_a from public.classeur_classeurs where deleted_at is null order by id limit 1;
  select id into v_b from public.classeur_classeurs where deleted_at is null order by id offset 1 limit 1;

  -- Mise en place (rôle propriétaire, avant de basculer en authenticated) ---
  delete from public.user_page_permissions where page = 'classeur' and user_id in (v_lect, v_ecri, v_sans, v_gest);
  insert into public.user_page_permissions (user_id, page, level) values
    (v_lect, 'classeur', 'lecture'), (v_ecri, 'classeur', 'ecriture'), (v_gest, 'classeur', 'gestion');
  update public.classeur_classeurs set visibilite = 'public', created_by = v_admin where id = v_a;
  update public.classeur_classeurs set visibilite = 'prive', created_by = v_admin where id = v_b;
  insert into public.classeur_classeurs (name, icon, visibilite, created_by)
    values ('TEST GESTION', 'Folder', 'gestion', v_admin) returning id into v_g;
  -- Une exception par personne n'ouvre plus rien (table plus lue).
  delete from public.classeur_acces where classeur_id in (v_a, v_b);
  insert into public.classeur_acces (classeur_id, user_id, niveau) values (v_b, v_ecri, 'ecriture');

  perform set_config('role', 'authenticated', true);

  ---------------------------------------------------------------- SANS PAGE
  perform set_config('request.jwt.claims', json_build_object('sub', v_sans, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, (format('sans page : %s classeurs vus', v_n))::text); end if;
  select count(*) into v_n from public.classeur_chapters;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, (format('sans page : %s chapitres vus', v_n))::text); end if;
  select count(*) into v_n from public.classeur_documents;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, (format('sans page : %s documents vus', v_n))::text); end if;
  select count(*) into v_n from storage.objects where bucket_id = 'classeur-images';
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, (format('sans page : %s images vues', v_n))::text); end if;

  ---------------------------------------------------------------- PAGE LECTURE
  perform set_config('request.jwt.claims', json_build_object('sub', v_lect, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id = v_a;
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('lecture : A public invisible')::text); end if;
  select count(*) into v_n from public.classeur_classeurs where id in (v_b, v_g);
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('lecture : un privé ou un classeur de gestion visible')::text); end if;
  select count(*) into v_n from public.classeur_chapters where classeur_id = v_b;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('lecture : chapitres de B privé visibles')::text); end if;
  select count(*) into v_n from storage.objects
   where bucket_id = 'classeur-images' and name like v_b::text || '/%';
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('lecture : images de B privé visibles')::text); end if;
  update public.classeur_chapters set label = label where classeur_id = v_a;
  get diagnostics v_n = row_count;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, (format('lecture : %s chapitres de A modifiés', v_n))::text); end if;
  update public.classeur_classeurs set visibilite = 'prive' where id = v_a;
  get diagnostics v_n = row_count;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('lecture : change le type de A')::text); end if;

  ---------------------------------------------------------------- PAGE ECRITURE
  perform set_config('request.jwt.claims', json_build_object('sub', v_ecri, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id in (v_a, v_b, v_g);
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, (format('ecriture : %s/1 classeurs vus (A seul ; exception sur B ignorée)', v_n))::text); end if;
  update public.classeur_chapters set label = label where classeur_id = v_a;
  get diagnostics v_n = row_count;
  if v_n > 0 or not exists (select 1 from public.classeur_chapters where classeur_id = v_a) then ok := ok + 1;
  else ko := array_append(ko, ('ecriture : ne modifie pas un public')::text); end if;
  update public.classeur_chapters set label = label where classeur_id = v_b;
  get diagnostics v_n = row_count;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('ecriture : B privé de l''admin modifié')::text); end if;
  update public.classeur_documents d set content = d.content || E'\nTEST'
    from public.classeur_chapters c where c.id = d.chapter_id and c.classeur_id = v_a
     and d.id = (select min(d2.id) from public.classeur_documents d2
                  join public.classeur_chapters c2 on c2.id = d2.chapter_id
                 where c2.classeur_id = v_a and d2.deleted_at is null);
  get diagnostics v_n = row_count;
  if v_n = 0 or exists (select 1 from public.classeur_document_versions where classeur_id = v_a) then ok := ok + 1;
  else ko := array_append(ko, ('ecriture : versions de A invisibles')::text); end if;

  -- Gardes sur le public d'un autre : type, auteur, suppression, ordre.
  foreach v_txt in array array['visibilite', 'created_by', 'deleted_at', 'sort_order'] loop
    attendu_err := false;
    begin
      execute format(
        'update public.classeur_classeurs set %I = %s where id = %s', v_txt,
        case v_txt when 'visibilite' then quote_literal('prive')
                   when 'created_by' then quote_literal(v_ecri)
                   when 'deleted_at' then 'now()'
                   else 'sort_order + 1' end, v_a);
    exception when insufficient_privilege then attendu_err := true;
    end;
    if attendu_err then ok := ok + 1; else ko := array_append(ko, (format('ecriture : %s du public d''un autre modifiable', v_txt))::text); end if;
  end loop;
  attendu_err := false;
  begin
    insert into public.classeur_classeurs (name, visibilite) values ('TEST REFUS', 'gestion');
  exception when insufficient_privilege then attendu_err := true;
  end;
  if attendu_err then ok := ok + 1; else ko := array_append(ko, ('ecriture : crée un classeur de gestion')::text); end if;
  select count(*) into v_n from public.classeur_personnes();
  if v_n >= 3 then ok := ok + 1; else ko := array_append(ko, (format('ecriture : %s personnes listées', v_n))::text); end if;

  -- Création d'un privé : relu, modifiable, en fin de liste.
  insert into public.classeur_classeurs (name, icon, visibilite, sort_order)
    values ('TEST ACCES', 'Folder', 'prive', 999) returning id into v_neuf;
  select visibilite into v_txt from public.classeur_classeurs where id = v_neuf;
  if v_txt = 'prive' then ok := ok + 1; else ko := array_append(ko, (format('ecriture : création en %s', v_txt))::text); end if;
  update public.classeur_classeurs set name = 'TEST ACCES 2' where id = v_neuf;
  get diagnostics v_n = row_count;
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('ecriture : l''auteur ne modifie pas son privé')::text); end if;

  ---------------------------------------------------------------- PAGE GESTION
  perform set_config('request.jwt.claims', json_build_object('sub', v_gest, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id in (v_a, v_g);
  if v_n = 2 then ok := ok + 1; else ko := array_append(ko, (format('gestion : %s/2 (public + gestion) vus', v_n))::text); end if;
  select count(*) into v_n from public.classeur_classeurs where id in (v_b, v_neuf);
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('gestion : voit le privé d''un autre')::text); end if;
  update public.classeur_classeurs set visibilite = 'gestion' where id = v_a;
  get diagnostics v_n = row_count;
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('gestion : ne range pas un public dans Gestion')::text); end if;

  ---------------------------------------------------------------- ADMIN
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id in (v_a, v_b, v_g, v_neuf);
  if v_n = 4 then ok := ok + 1; else ko := array_append(ko, (format('admin : %s/4 classeurs vus', v_n))::text); end if;
  update public.classeur_classeurs set created_by = v_gest where id = v_neuf;
  get diagnostics v_n = row_count;
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('admin : ne change pas l''auteur')::text); end if;
  attendu_err := false;
  begin
    update public.classeur_classeurs set created_by = v_sans where id = v_neuf;
  exception when check_violation then attendu_err := true;
  end;
  if attendu_err then ok := ok + 1; else ko := array_append(ko, ('admin : un compte sans la page devient auteur')::text); end if;
  select count(*) into v_n from public.audit_log
   where table_name = 'classeur_classeurs' and performed_by = v_admin
     and performed_at >= now() - interval '1 minute';
  if v_n >= 1 then ok := ok + 1; else ko := array_append(ko, (format('admin : %s lignes de journal', v_n))::text); end if;

  -- Le privé a changé d'auteur : le nouvel auteur le voit, l'ancien non.
  perform set_config('request.jwt.claims', json_build_object('sub', v_gest, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id = v_neuf;
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('gestion : ne voit pas le privé reçu')::text); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ecri, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id = v_neuf;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('ecriture : voit encore le privé donné')::text); end if;

  -- Durcissement du 2026-09-28 (classeur_securite_2026-09-28.sql) ---------
  begin
    insert into public.classeur_classeurs (id, name) values (987654321, 'TEST ID');
    ko := array_append(ko, ('ecriture : identifiant de classeur choisi accepté')::text);
  exception when generated_always then ok := ok + 1;
            when others then ko := array_append(ko, (format('ecriture : id choisi refusé pour une autre raison (%s)', sqlstate))::text);
  end;
  begin
    insert into public.classeur_images (classeur_id, chemin, nom)
      values (v_a, v_b::text || '/' || gen_random_uuid()::text || '.webp', 'TEST');
    ko := array_append(ko, ('fiche image dans le dossier d''un autre classeur')::text);
  exception when check_violation then ok := ok + 1;
            when insufficient_privilege then ok := ok + 1;   -- A rangé dans Gestion plus haut
            when others then ko := array_append(ko, (format('fiche incohérente refusée pour une autre raison (%s)', sqlstate))::text);
  end;

  -- Catalogue (rôle propriétaire).
  perform set_config('role', 'postgres', true);
  select sort_order into v_n from public.classeur_classeurs where id = v_neuf;
  if v_n = (select max(sort_order) from public.classeur_classeurs where id <> v_neuf) + 1 then ok := ok + 1;
  else ko := array_append(ko, (format('ecriture : classeur créé au rang %s, pas en fin de liste', v_n))::text); end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename like 'classeur\_%' and cmd = 'SELECT'
     and tablename not in ('classeur_periodicites', 'classeur_acces')
     and qual !~ 'classeur_(lecture_ok|lecture_ligne|chapter_read_ok)';
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, (format('catalogue : %s lecture(s) au seul rang de page (ancien fichier rejoué ?)', v_n))::text); end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'classeur_classeurs' and cmd = 'SELECT'
     and qual ~ 'visibilite';
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('catalogue : la lecture des classeurs ne suit pas leur type')::text); end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'classeur_merge_history' and cmd = 'DELETE'
     and qual ~ 'auto' and qual !~ 'classeur_write_ok';
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('catalogue : suppression des points auto sans classeur_write_ok')::text); end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'classeur_write_ok' and p.prosrc ~ 'classeur_niveau';
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('catalogue : classeur_write_ok n''est plus le niveau effectif')::text); end if;
  select count(*) into v_n from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relname like 'classeur\_%' and c.relkind = 'r' and a.attname = 'id' and a.attidentity = 'd';
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, (format('catalogue : %s identifiant(s) encore « by default »', v_n))::text); end if;
  select count(*) into v_n from pg_trigger where tgname = 'classeur_versions_suivent' and not tgisinternal;
  if v_n = 2 then ok := ok + 1; else ko := array_append(ko, (format('catalogue : %s/2 triggers classeur_versions_suivent', v_n))::text); end if;

  raise exception 'RESULTAT % % / % : %', case when cardinality(ko) = 0 then 'OK' else 'ECARTS' end,
    ok, ok + cardinality(ko), array_to_string(ko, ' | ');
end $$;
