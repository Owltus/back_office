-- =====================================================================
-- Planning : les jours passés sont figés en écriture, libres pour la
-- gestion (audit de sécurité run-2 du 2026-11-18, étape 3 du plan
-- `plan/securite-audit-run2-2026-11-18/`, décision Q1 = option a)
-- =====================================================================
-- Symptôme : un compte Planning en écriture (rang 2) réécrit un jour passé
--   d'une semaine non verrouillée : appel direct à l'API sur
--   `planning_affectations` / `planning_absences` (insert, update,
--   delete), ou par `planning_modifier_shift`, `planning_poser_absences`,
--   `planning_deplacer_statut`. L'aide dit pourtant que les jours passés
--   sont figés.
-- Cause : la règle « on ne touche pas au passé » (PL409) ne vit que dans
--   `private.planning_depuis`, appelée par Générer et Vider. Le seul
--   trigger de ligne (`planning_garde_verrou`) ne regarde que le verrou.
-- Correctif :
--   1. `private.planning_garde_passe`, BEFORE INSERT OR UPDATE OR DELETE
--      sur les deux tables : PL409 quand l'ancienne ou la nouvelle date est
--      avant aujourd'hui (Paris, `planning_aujourdhui`). Exceptions :
--      - la gestion de la page (rang 3, admin compris) : elle corrige le
--        passé après coup, cascades comprises (suppression d'un poste, d'un
--        motif, d'une personne, d'un horaire) ;
--      - le drapeau `planning.admin = 'on'` (transaction d'administration) ;
--      - un UPDATE qui ne change que `created_by` ou `updated_at` (compte
--        supprimé : FK `set null`) ;
--      - un UPDATE qui ne fait que passer `epinglee` de false à true : on
--        valide une proposition, rien de ce qui a été fait ne change.
--      Les triggers s'appellent `planning_affectations_zpasse` et
--      `planning_absences_zpasse` : les triggers BEFORE jouent dans l'ordre
--      alphabétique, ceux-ci passent APRÈS `_verrou`, et une semaine
--      verrouillée garde son message PL423 (figée pour tous).
--   2. `planning_valider_avec_repos` (dernière définition :
--      20261112120000) : remettre en proposition (`p_epinglee = false`) ne
--      touche plus que les jours à partir d'aujourd'hui, et les repos ne
--      sont posés qu'à partir d'aujourd'hui. Valider reste possible sur
--      toute la semaine. Seuil des congés convertis en repos corrigé : au
--      plus `nombre - 5` jours par personne et par semaine (rang calculé
--      dans une CTE). L'ancien test « au moins 6 congés » était lu sur
--      l'état d'avant la commande : une demande qui listait les 7 jours
--      d'une semaine de congé les convertissait tous.
--   3. `private.planning_horaires_suivent` (dernière définition :
--      20261102100000) : un horaire modifié ne déplace que les shifts À
--      VENIR, comme son commentaire le disait déjà.
-- Innocuité : Générer et Vider ne travaillaient déjà qu'à partir
--   d'aujourd'hui (`planning_depuis`) et gardent leur message. L'écran
--   grise désormais les gestes d'un jour passé pour un compte en écriture.
--   La gestion n'est pas touchée. Le seed et la copie de la prod écrivent
--   en `session_replication_role = replica` (triggers coupés). Aucune
--   donnée réécrite.
-- =====================================================================

-- 1. Garde des jours passés -------------------------------------------------
-- Attention : le contexte système (auth.uid() null, clé secrète) N'EST PAS
-- exempté, contrairement aux autres gardes. Une reprise de données ou une
-- tâche serveur qui écrit dans le passé du planning doit poser
-- set_config('planning.admin', 'on', true) dans sa transaction.
create or replace function private.planning_garde_passe()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_auj date;
  v_avant date;
  v_apres date;
begin
  if current_setting('planning.admin', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- La gestion corrige le passé (décision du 2026-11-18), cascades comprises.
  if private.planning_niveau() >= 3 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Seule la trace de l'auteur change (compte supprimé) : pas une retouche.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'created_by' - 'updated_at') = (to_jsonb(old) - 'created_by' - 'updated_at') then
    return new;
  end if;
  -- Valider une proposition ne change rien de ce qui a été fait.
  if tg_op = 'UPDATE' and new.epinglee and not old.epinglee
     and (to_jsonb(new) - 'created_by' - 'updated_at' - 'epinglee')
       = (to_jsonb(old) - 'created_by' - 'updated_at' - 'epinglee') then
    return new;
  end if;
  if tg_table_name = 'planning_affectations' then
    if tg_op <> 'INSERT' then v_avant := old.lundi + old.jour; end if;
    if tg_op <> 'DELETE' then v_apres := new.lundi + new.jour; end if;
  else
    if tg_op <> 'INSERT' then v_avant := old.jour; end if;
    if tg_op <> 'DELETE' then v_apres := new.jour; end if;
  end if;
  v_auj := private.planning_aujourdhui();
  if v_avant < v_auj or v_apres < v_auj then
    raise exception 'On ne touche pas au passé : ce jour est terminé. Seule la gestion du planning peut le corriger.'
      using errcode = 'PL409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

alter function private.planning_garde_passe() owner to postgres;
revoke all on function private.planning_garde_passe() from public, anon, authenticated;

create trigger planning_affectations_zpasse
  before insert or update or delete on public.planning_affectations
  for each row execute function private.planning_garde_passe();
create trigger planning_absences_zpasse
  before insert or update or delete on public.planning_absences
  for each row execute function private.planning_garde_passe();

-- 2. Valider, remettre en proposition : bornés à aujourd'hui ---------------
create or replace function public.planning_valider_avec_repos(p_lundi date, p_salarie bigint, p_jour integer, p_epinglee boolean, p_repos jsonb)
 returns integer
 language plpgsql
 set search_path to ''
as $function$
declare
  v_n integer := 0;
  v_m integer;
  v_motif bigint;
  v_auj date := private.planning_aujourdhui();
  -- La gestion corrige le passé (décision Q1 du 2026-11-18) : les bornes
  -- ci-dessous ne valent que pour l'écriture.
  v_gestion boolean := private.planning_niveau() >= 3;
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  if extract(isodow from p_lundi) <> 1 then
    raise exception 'Semaine invalide.' using errcode = 'PL400';
  end if;
  perform pg_advisory_xact_lock(hashtext('planning:' || p_lundi::text));

  -- Valider : toute la semaine. Remettre en proposition : à partir
  -- d'aujourd'hui seulement (un jour passé ne redevient pas une proposition).
  update public.planning_affectations set epinglee = p_epinglee
   where lundi = p_lundi
     and (p_salarie is null or salarie_id = p_salarie)
     and (p_jour is null or jour = p_jour)
     and epinglee is distinct from p_epinglee
     and (p_epinglee or v_gestion or lundi + jour >= v_auj);
  get diagnostics v_n = row_count;

  update public.planning_absences ab set epinglee = p_epinglee
    from public.planning_motifs m
   where m.id = ab.motif_id
     and (m.nature = 'repos' or m.role in ('ferie_rattrape', 'ferie_chome'))
     and ab.jour between p_lundi and p_lundi + 6
     and (p_salarie is null or ab.salarie_id = p_salarie)
     and (p_jour is null or ab.jour = p_lundi + p_jour)
     and ab.epinglee is distinct from p_epinglee
     and (p_epinglee or v_gestion or ab.jour >= v_auj);
  get diagnostics v_m = row_count;
  v_n := v_n + v_m;

  if p_epinglee and jsonb_array_length(coalesce(p_repos, '[]'::jsonb)) > 0 then
    -- Le repos par défaut (rôle), sinon le premier motif de nature repos.
    select id into v_motif from public.planning_motifs
     where nature = 'repos'
     order by (role is not distinct from 'repos_defaut') desc, id limit 1;
    if v_motif is null then
      raise exception 'Aucun motif Repos dans les réglages.' using errcode = 'PL409';
    end if;
    with demandes as (
      select distinct (r ->> 'salarie_id')::bigint as salarie_id,
             p_lundi + (r ->> 'jour')::int as jour
        from jsonb_array_elements(p_repos) r
       where (r ->> 'jour')::int between 0 and 6
         -- Un repos ne se pose pas sur un jour passé.
         and (v_gestion or p_lundi + (r ->> 'jour')::int >= v_auj)
         and (p_salarie is null or (r ->> 'salarie_id')::bigint = p_salarie)
         and (p_jour is null or (r ->> 'jour')::int = p_jour)
         -- Un jour qui a reçu un shift entre-temps n'est plus un repos.
         and not exists (
           select 1 from public.planning_affectations a
            where a.lundi = p_lundi and a.salarie_id = (r ->> 'salarie_id')::bigint
              and a.jour = (r ->> 'jour')::int)
    ),
    -- Les congés (absences décomptées) de la semaine, avec leur nombre.
    conges as (
      select b.salarie_id, b.jour,
             count(*) over (partition by b.salarie_id) as nombre
        from public.planning_absences b
        join public.planning_motifs m on m.id = b.motif_id
       where b.jour between p_lundi and p_lundi + 6
         and m.nature = 'absence' and m.decompte
         and b.salarie_id in (select d.salarie_id from demandes d)
    ),
    -- Au plus `nombre - 5` congés deviennent des repos : 5 restent.
    convertis as (
      select d.salarie_id, d.jour
        from (select d.salarie_id, d.jour, c.nombre,
                     row_number() over (partition by d.salarie_id order by d.jour) as rang
                from demandes d
                join conges c on c.salarie_id = d.salarie_id and c.jour = d.jour) d
       where d.rang <= d.nombre - 5
    )
    insert into public.planning_absences (salarie_id, jour, motif_id, epinglee)
    select d.salarie_id, d.jour, v_motif, true
      from demandes d
     where not exists (select 1 from conges c
                        where c.salarie_id = d.salarie_id and c.jour = d.jour)
        or exists (select 1 from convertis k
                    where k.salarie_id = d.salarie_id and k.jour = d.jour)
    on conflict (salarie_id, jour) do update
       set motif_id = excluded.motif_id, epinglee = true
     where exists (
             select 1 from public.planning_motifs m
              where m.id = planning_absences.motif_id
                and m.nature = 'absence' and m.decompte);
    get diagnostics v_m = row_count;
    v_n := v_n + v_m;
  end if;
  return v_n;
end $function$;

-- 3. Un horaire modifié ne déplace que les shifts à venir ------------------
create or replace function private.planning_horaires_suivent()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if (new.debut, new.fin, new.pause) is distinct from (old.debut, old.fin, old.pause) then
    update public.planning_affectations a
       set debut = (private.planning_horaire_de(new.debut, new.fin)).debut,
           fin = (private.planning_horaire_de(new.debut, new.fin)).fin,
           pause = new.pause
     where a.horaire_id = new.id
       and not private.planning_verrouillee(a.lundi)
       and a.lundi + a.jour >= private.planning_aujourdhui();
    update public.planning_besoins set debut = new.debut, fin = new.fin
     where horaire_id = new.id;
  end if;
  return null;
end $function$;
