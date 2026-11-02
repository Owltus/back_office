-- Journée étoile sur les horaires qui existent (demande utilisateur du
-- 2026-11-02 : « le bouton pour mettre en place les journées dites étoile,
-- qui modifie les horaires, doit disparaître ; tu dois vraiment bien utiliser
-- et seulement utiliser les horaires déjà disponibles »). Décisions du même
-- jour :
--   D1. Plus de raccourci : un shift n'est plus « fait court » en retirant une
--       heure à son horaire. Colonnes `planning_horaires.raccourci`,
--       `planning_horaires.raccourci_debut`, `planning_affectations.court`
--       supprimées (SUPPRIMER au clavier à la livraison), avec leurs
--       contraintes et ce qui les lisait.
--   D2. Tous les shifts sont effacés, historique et semaines verrouillées
--       compris (accord explicite de l'utilisateur) : ils portaient des
--       journées courtes qui n'existent plus. Absences, repos, école, verrous
--       et réglages restent.
--   D3-D5. La journée étoile d'un contrat de plus de 35 h est le jour où il
--       fait un horaire de MOINS de 8 h ; elle se calcule, rien n'est stocké.
--   D8. Une liste d'horaires permis (poste, fiche) NON VIDE qui contient un
--       horaire de 8 h exactement reçoit aussi ses versions étoile : les horaires
--       qui existent, de 7 h à moins de 8 h de travail, d'un moment quelconque, et
--       contenus dans ses heures (la nuit de 23:00 à 07:00 contient celle de
--       00:00 à 07:00). Liste vide = « Tous » : rien à faire.
--
-- Un horaire qui commence à minuit (00:00) s'écrit « 24:00 » sur le jour où
-- il est posé : la nuit de minuit commence à la FIN de ce jour, comme
-- l'ancienne nuit étoile et comme sur les plannings imprimés (lib/planning
-- `horaireDe`, même règle).

-- 1) Le trigger qui recale un shift sur son horaire lit `court` : retiré le
--    temps de changer la table, recréé plus bas sans lui.
drop trigger planning_affectations_caler on public.planning_affectations;

-- 2) D2 : tous les shifts partent. La garde des semaines verrouillées
--    (PL423) est coupée le temps du seul effacement, puis remise.
alter table public.planning_affectations disable trigger planning_affectations_verrou;
delete from public.planning_affectations;
alter table public.planning_affectations enable trigger planning_affectations_verrou;

-- 3) Heures d'un shift posé avec un horaire : celles de l'horaire, minuit en
--    début écrit « 24:00 ». Même nom qu'avant (aide listée dans
--    00_socle.test.sql et verif_advisor.sql), sans raccourci.
drop function private.planning_horaire_de(text, text, integer, integer, boolean);
create function private.planning_horaire_de(
  p_debut text, p_fin text, out debut text, out fin text)
  language plpgsql immutable
  set search_path to ''
as $$
begin
  debut := case when p_debut = '00:00' then '24:00' else p_debut end;
  fin := p_fin;
end $$;
revoke all on function private.planning_horaire_de(text, text) from public;
grant execute on function private.planning_horaire_de(text, text)
  to authenticated, service_role;

-- Un shift codé prend les heures et la pause de son horaire (prototype
-- `_caler_sur_code`) : la base ne fait pas confiance aux heures envoyées par
-- l'écran. Sans horaire, les heures saisies restent.
create or replace function private.planning_caler_sur_code() returns trigger
  language plpgsql
  set search_path to ''
as $$
declare
  h public.planning_horaires;
begin
  if new.horaire_id is null then
    return new;
  end if;
  select * into h from public.planning_horaires where id = new.horaire_id;
  if not found then return new; end if;
  select d.debut, d.fin into new.debut, new.fin
    from private.planning_horaire_de(h.debut, h.fin) d;
  new.pause := h.pause;
  return new;
end $$;
revoke all on function private.planning_caler_sur_code() from public, anon, authenticated;

-- Un horaire modifié : les shifts à venir le suivent (pas ceux des semaines
-- verrouillées), et les besoins aussi.
create or replace function private.planning_horaires_suivent() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if (new.debut, new.fin, new.pause) is distinct from (old.debut, old.fin, old.pause) then
    update public.planning_affectations a
       set debut = (private.planning_horaire_de(new.debut, new.fin)).debut,
           fin = (private.planning_horaire_de(new.debut, new.fin)).fin,
           pause = new.pause
     where a.horaire_id = new.id
       and not private.planning_verrouillee(a.lundi);
    update public.planning_besoins set debut = new.debut, fin = new.fin
     where horaire_id = new.id;
  end if;
  return null;
end $$;
revoke all on function private.planning_horaires_suivent() from public, anon, authenticated;

-- 4) D1 : les colonnes partent, avec leurs contraintes.
alter table public.planning_affectations drop column court;
alter table public.planning_horaires
  drop constraint planning_horaires_raccourci_debut,
  drop constraint planning_horaires_court;
alter table public.planning_horaires
  drop column raccourci,
  drop column raccourci_debut;

create trigger planning_affectations_caler
  before insert or update of horaire_id, debut, fin, pause on public.planning_affectations
  for each row execute function private.planning_caler_sur_code();

-- 5) Les RPC qui écrivaient `court` : même signature (droits gardés), sans
--    lui. Corps repris de 20261031140000 et 20261027110000.
create or replace function public.planning_appliquer_generation(
  p_lundi date, p_etat text, p_depuis integer, p_tout boolean, p_exclus bigint[],
  p_sans_effacer boolean, p_nouvelles jsonb)
  returns integer
  language plpgsql security invoker
  set search_path to ''
as $$
declare
  v_depuis integer;
  v_n integer;
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('planning:' || p_lundi::text));
  if private.planning_verrouillee(p_lundi) then
    raise exception 'Semaine verrouillée : c''est un planning réalisé.' using errcode = 'PL423';
  end if;
  v_depuis := private.planning_depuis(p_lundi);
  if p_depuis is distinct from v_depuis then
    raise exception 'La date du jour a changé pendant le calcul : relancez.' using errcode = 'PL409';
  end if;
  if p_etat is distinct from private.planning_etat(p_lundi) then
    raise exception 'Le planning a changé pendant le calcul : relancez.' using errcode = 'PL409';
  end if;
  if not coalesce(p_sans_effacer, false) then
    delete from public.planning_affectations
     where lundi = p_lundi and jour >= v_depuis
       and (p_tout or not epinglee or salarie_id = any (coalesce(p_exclus, '{}')));
    delete from public.planning_absences
     where not epinglee
       and jour between p_lundi + v_depuis and p_lundi + 6;
  end if;
  insert into public.planning_affectations
    (lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, epinglee, pause)
  select p_lundi, (n ->> 'salarie_id')::bigint, (n ->> 'poste_id')::bigint,
         (n ->> 'jour')::smallint, nullif(n ->> 'horaire_id', '')::bigint,
         n ->> 'debut', n ->> 'fin', false,
         coalesce((n ->> 'pause')::int, 0)
    from jsonb_array_elements(coalesce(p_nouvelles, '[]'::jsonb)) n
   where (n ->> 'jour')::int >= v_depuis
     and not exists (
       select 1 from public.planning_absences ab
        where ab.salarie_id = (n ->> 'salarie_id')::bigint
          and ab.jour = p_lundi + (n ->> 'jour')::int);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Modifie un shift (valeurs finales calculées par le client). Déposé sur une
-- case qui a déjà un shift, les deux s'échangent (une personne n'a jamais
-- qu'un shift par jour). Toute retouche valide (épingle) les deux shifts.
create or replace function public.planning_modifier_shift(p_id bigint, p_maj jsonb)
  returns void
  language plpgsql security invoker
  set search_path to ''
as $$
declare
  a public.planning_affectations;
  v_lundi date;
  v_occupant bigint;
  v_salarie bigint;
  v_jour smallint;
begin
  -- Même ordre de verrous que la génération et « vider » (consultatif de la
  -- semaine, PUIS les lignes) : sinon un glisser-déposer pendant un
  -- « Compléter » peut finir en interblocage.
  select lundi into v_lundi from public.planning_affectations where id = p_id;
  if not found then
    raise exception 'Ce shift n''existe plus : rechargez la semaine.' using errcode = 'PL409';
  end if;
  perform pg_advisory_xact_lock(hashtext('planning:' || v_lundi::text));
  select * into a from public.planning_affectations where id = p_id for update;
  if not found then
    raise exception 'Ce shift n''existe plus : rechargez la semaine.' using errcode = 'PL409';
  end if;
  v_salarie := coalesce((p_maj ->> 'salarie_id')::bigint, a.salarie_id);
  v_jour := coalesce((p_maj ->> 'jour')::smallint, a.jour);
  if (v_salarie, v_jour) is distinct from (a.salarie_id, a.jour) then
    select id into v_occupant from public.planning_affectations
     where lundi = a.lundi and salarie_id = v_salarie and jour = v_jour and id <> a.id;
  end if;
  set constraints public.planning_affectations_un_par_jour deferred;
  update public.planning_affectations set
    salarie_id = v_salarie,
    jour = v_jour,
    poste_id = coalesce((p_maj ->> 'poste_id')::bigint, poste_id),
    horaire_id = case when p_maj ? 'horaire_id' then nullif(p_maj ->> 'horaire_id', '')::bigint
                      else horaire_id end,
    debut = coalesce(p_maj ->> 'debut', debut),
    fin = coalesce(p_maj ->> 'fin', fin),
    pause = coalesce((p_maj ->> 'pause')::int, pause),
    epinglee = coalesce((p_maj ->> 'epinglee')::boolean, true)
   where id = a.id;
  if v_occupant is not null then
    update public.planning_affectations
       set salarie_id = a.salarie_id, jour = a.jour, epinglee = true
     where id = v_occupant;
  end if;
  set constraints public.planning_affectations_un_par_jour immediate;
end $$;

-- 6) D8 : les versions étoile rejoignent les listes qui ont leur horaire de
--    8 h. Calculé sur les heures (aucun id en dur), même règle que
--    `versionsEtoile` (lib/planning/etoile.ts) :
--      - H : 8 h de travail exactement (présence moins pause) ;
--      - V : de 7 h à moins de 8 h, d'un moment quelconque (09:00–16:45,
--        middle, est la version de 08:00–16:45, matin) ;
--      - V contenu dans H, en minutes depuis le début du jour de H (minuit en
--        début compte 24:00 : la nuit de 23:00 contient celle de 00:00).
--    Les ids ajoutés vont en fin de liste, du plus petit au plus grand.
with h as (
  select id,
         case when debut = '00:00' then 1440 else private.planning_minutes(debut) end as d,
         private.planning_presence(debut, fin) as presence,
         pause
    from public.planning_horaires
), v as (
  select a.id as h_id, b.id as v_id
    from h a
    join h b on b.id <> a.id
     and a.presence - a.pause = 480
     and b.presence - b.pause >= 420
     and b.presence - b.pause < 480
     and b.d >= a.d
     and b.d + b.presence <= a.d + a.presence
)
update public.planning_postes p
   set horaires_autorises = p.horaires_autorises || array(
         select distinct v.v_id from v
          where v.h_id = any (p.horaires_autorises)
            and not v.v_id = any (p.horaires_autorises)
          order by v.v_id)
 where cardinality(p.horaires_autorises) > 0
   and exists (
         select 1 from v
          where v.h_id = any (p.horaires_autorises)
            and not v.v_id = any (p.horaires_autorises));

with h as (
  select id,
         case when debut = '00:00' then 1440 else private.planning_minutes(debut) end as d,
         private.planning_presence(debut, fin) as presence,
         pause
    from public.planning_horaires
), v as (
  select a.id as h_id, b.id as v_id
    from h a
    join h b on b.id <> a.id
     and a.presence - a.pause = 480
     and b.presence - b.pause >= 420
     and b.presence - b.pause < 480
     and b.d >= a.d
     and b.d + b.presence <= a.d + a.presence
)
update public.planning_salaries s
   set shifts_autorises = s.shifts_autorises || array(
         select distinct v.v_id from v
          where v.h_id = any (s.shifts_autorises)
            and not v.v_id = any (s.shifts_autorises)
          order by v.v_id)
 where cardinality(s.shifts_autorises) > 0
   and exists (
         select 1 from v
          where v.h_id = any (s.shifts_autorises)
            and not v.v_id = any (s.shifts_autorises));
