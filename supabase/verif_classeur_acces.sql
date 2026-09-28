-- =============================================================================
-- verif_classeur_acces.sql — MATRICE des droits par classeur, rejouable.
-- Plan : plan/classeur-acces-par-classeur/3-tests-base.md
--
-- Tout se passe dans UN bloc qui se termine TOUJOURS par une exception :
-- la transaction est annulée, rien ne reste (droits de page simulés,
-- exceptions, classeur de test, modifications). Le résultat sort dans le
-- message d'erreur : `RESULTAT OK n/n` ou la liste des écarts.
--
-- Profils simulés : trois comptes NON admin existants, choisis au lancement
-- (les trois premiers par date de création), à qui l'on pose un droit de page
-- le temps du test ; l'admin (profiles.role = 'admin') pour la gestion.
-- Classeurs : les deux premiers classeurs existants (A, B), plus un classeur
-- créé pendant le test.
-- =============================================================================

do $$
declare
  v_admin uuid;
  v_lect  uuid;   -- page lecture
  v_ecri  uuid;   -- page ecriture
  v_sans  uuid;   -- aucun droit de page
  v_a bigint; v_b bigint; v_neuf bigint;
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
  select id into v_a from public.classeur_classeurs where deleted_at is null order by id limit 1;
  select id into v_b from public.classeur_classeurs where deleted_at is null order by id offset 1 limit 1;

  -- Mise en place (rôle propriétaire, avant de basculer en authenticated) ---
  delete from public.user_page_permissions where page = 'classeur' and user_id in (v_lect, v_ecri, v_sans);
  insert into public.user_page_permissions (user_id, page, level) values
    (v_lect, 'classeur', 'lecture'), (v_ecri, 'classeur', 'ecriture');
  update public.classeur_classeurs set acces_tous = 'lecture' where id = v_a;
  update public.classeur_classeurs set acces_tous = 'aucun' where id = v_b;   -- B privé
  delete from public.classeur_acces where classeur_id in (v_a, v_b);
  insert into public.classeur_acces (classeur_id, user_id, niveau) values
    (v_a, v_lect, 'ecriture'),   -- plafonné par la page lecture
    (v_a, v_ecri, 'ecriture'),
    (v_b, v_ecri, 'lecture');    -- ouvre un classeur privé en lecture

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
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('lecture : A (pour tous) invisible')::text); end if;
  select count(*) into v_n from public.classeur_classeurs where id = v_b;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('lecture : B privé visible')::text); end if;
  select count(*) into v_n from public.classeur_chapters where classeur_id = v_b;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('lecture : chapitres de B privé visibles')::text); end if;
  select count(*) into v_n from storage.objects
   where bucket_id = 'classeur-images' and name like v_b::text || '/%';
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('lecture : images de B privé visibles')::text); end if;
  -- Exception « ecriture » sur A, mais page lecture : plafond.
  update public.classeur_chapters set label = label where classeur_id = v_a;
  get diagnostics v_n = row_count;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, (format('lecture : %s chapitres de A modifiés (plafond ignoré)', v_n))::text); end if;
  update public.classeur_documents d set content = d.content || 'X'
    from public.classeur_chapters c where c.id = d.chapter_id and c.classeur_id = v_a;
  get diagnostics v_n = row_count;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('lecture : documents de A modifiés')::text); end if;

  ---------------------------------------------------------------- PAGE ECRITURE
  perform set_config('request.jwt.claims', json_build_object('sub', v_ecri, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id in (v_a, v_b);
  if v_n = 2 then ok := ok + 1; else ko := array_append(ko, (format('ecriture : %s/2 classeurs vus (A + B ouvert en lecture)', v_n))::text); end if;
  update public.classeur_chapters set label = label where classeur_id = v_a;
  get diagnostics v_n = row_count;
  if v_n > 0 then ok := ok + 1; else ko := array_append(ko, ('ecriture : exception ecriture sur A sans effet')::text); end if;
  update public.classeur_chapters set label = label where classeur_id = v_b;
  get diagnostics v_n = row_count;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('ecriture : B (exception lecture) modifié')::text); end if;
  -- Un enregistrement de document crée des versions, lisibles par l'ayant droit.
  update public.classeur_documents d set content = d.content || E'\nTEST'
    from public.classeur_chapters c where c.id = d.chapter_id and c.classeur_id = v_a
     and d.id = (select min(d2.id) from public.classeur_documents d2
                  join public.classeur_chapters c2 on c2.id = d2.chapter_id
                 where c2.classeur_id = v_a and d2.deleted_at is null);
  select count(*) into v_n from public.classeur_document_versions where classeur_id = v_a;
  if v_n >= 1 then ok := ok + 1; else ko := array_append(ko, ('ecriture : versions de A invisibles')::text); end if;

  -- Gardes : réservé à la gestion.
  foreach v_txt in array array['acces_tous', 'deleted_at', 'sort_order'] loop
    attendu_err := false;
    begin
      execute format(
        'update public.classeur_classeurs set %I = %s where id = %s', v_txt,
        case v_txt when 'acces_tous' then quote_literal('aucun')
                   when 'deleted_at' then 'now()'
                   else 'sort_order + 1' end, v_a);
    exception when insufficient_privilege then attendu_err := true;
    end;
    if attendu_err then ok := ok + 1; else ko := array_append(ko, (format('ecriture : %s modifiable sans gestion', v_txt))::text); end if;
  end loop;
  attendu_err := false;
  begin
    insert into public.classeur_acces (classeur_id, user_id, niveau) values (v_a, v_sans, 'lecture');
  exception when insufficient_privilege then attendu_err := true;
  end;
  if attendu_err then ok := ok + 1; else ko := array_append(ko, ('ecriture : peut donner des accès')::text); end if;
  attendu_err := false;
  begin
    perform * from public.classeur_personnes();
  exception when insufficient_privilege then attendu_err := true;
  end;
  if attendu_err then ok := ok + 1; else ko := array_append(ko, ('ecriture : lit la liste des personnes')::text); end if;

  -- Création : « privé » refusé → forcé à lecture pour tous ; créateur en écriture.
  insert into public.classeur_classeurs (name, icon, acces_tous, sort_order)
    values ('TEST ACCES', 'Folder', 'aucun', 999) returning id into v_neuf;
  select acces_tous into v_txt from public.classeur_classeurs where id = v_neuf;
  if v_txt = 'lecture' then ok := ok + 1; else ko := array_append(ko, (format('ecriture : création en %s (privé non forcé)', v_txt))::text); end if;
  update public.classeur_classeurs set name = 'TEST ACCES 2' where id = v_neuf;
  get diagnostics v_n = row_count;
  if v_n = 1 then ok := ok + 1; else ko := array_append(ko, ('ecriture : créateur ne modifie pas son classeur')::text); end if;

  ---------------------------------------------------------------- GESTION (admin)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id in (v_a, v_b, v_neuf);
  if v_n = 3 then ok := ok + 1; else ko := array_append(ko, (format('admin : %s/3 classeurs vus', v_n))::text); end if;
  insert into public.classeur_acces (classeur_id, user_id, niveau) values (v_neuf, v_ecri, 'aucun');
  update public.classeur_classeurs set acces_tous = 'aucun' where id = v_neuf;
  select count(*) into v_n from public.classeur_personnes();
  if v_n >= 3 then ok := ok + 1; else ko := array_append(ko, (format('admin : %s personnes listées', v_n))::text); end if;
  select count(*) into v_n from public.audit_log
   where table_name in ('classeur_acces', 'classeur_classeurs') and performed_by = v_admin
     and performed_at >= now() - interval '1 minute';
  if v_n >= 2 then ok := ok + 1; else ko := array_append(ko, (format('admin : %s lignes de journal', v_n))::text); end if;

  -- Retrait au créateur : exception « aucun » sur son propre classeur.
  perform set_config('request.jwt.claims', json_build_object('sub', v_ecri, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.classeur_classeurs where id = v_neuf;
  if v_n = 0 then ok := ok + 1; else ko := array_append(ko, ('ecriture : créateur voit encore après retrait')::text); end if;

  raise exception 'RESULTAT % % / % : %', case when cardinality(ko) = 0 then 'OK' else 'ECARTS' end,
    ok, ok + cardinality(ko), array_to_string(ko, ' | ');
end $$;
