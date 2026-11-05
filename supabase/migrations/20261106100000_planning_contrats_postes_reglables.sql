-- Contrats et postes réglables par l'établissement (lot 1a du plan
-- `plan/planning-moteur-configurable-2026-11-05/10-audit-notions-en-dur.md`).
--
-- Demande utilisateur du 2026-11-06 : « qu'aucun paramètre ne soit en dur,
-- avec des termes tels que des rôles, des postes… ». Défauts = l'hôtel
-- d'aujourd'hui, à l'identique.
--
-- 1. Les types de contrat deviennent LA liste de l'établissement
--    (`planning_modeles_contrat`) : un nom affiché, un ordre, et les cases
--    qui remplaçaient des listes en dur (durée max d'un jour, mineur
--    possible, forfait jours possible, fin obligatoire). La clé texte
--    (`type_contrat`) reste l'identifiant ; `planning_salaries.type_contrat`
--    y renvoie par clé étrangère.
-- 2. Mineur et forfait jours se contrôlent par le modèle du contrat
--    (trigger), plus par une liste de codes.
-- 3. Le forfait jours se décide aussi par le GROUPE (`forfait_possible`),
--    à la place du nom « Direction » reconnu par l'écran.
-- 4. La durée max d'un service se règle sur le POSTE (`jour_max_minutes`),
--    à la place de la catégorie ; la loi la borne à 12 h.
-- 5. Jours fériés : ancienneté et fenêtre de rattrapage dans les règles.
--
-- RETIRE (livraison : `--supprimer`) : les CHECK de valeurs fixes
-- `planning_modeles_contrat_type_contrat_check`,
-- `planning_salaries_type_contrat_check`, `planning_salaries_forfait_cadre`,
-- `planning_salaries_mineur_alternance` (remplacés par la clé étrangère et
-- le trigger, qui disent la même chose aux défauts).
-- ÉCRIT DES DONNÉES (livraison : `--avec-donnees`) : noms et cases des cinq
-- contrats, durée max des postes d'après leur catégorie, groupe Direction.
-- La colonne `planning_postes.categorie` est GARDÉE (plus lue par le
-- calcul) : la retirer serait un retrait de plus, sans gain.

-- ------------------------------------------- 1. la liste des contrats
alter table public.planning_modeles_contrat
  drop constraint planning_modeles_contrat_type_contrat_check;

alter table public.planning_modeles_contrat
  add column nom text,
  add column ordre integer not null default 0,
  add column jour_max_minutes integer
    check (jour_max_minutes is null or jour_max_minutes between 60 and 720),
  add column mineur_possible boolean not null default false,
  add column forfait_possible boolean not null default false,
  add column fin_obligatoire boolean not null default false,
  add constraint planning_modeles_contrat_code
    check (type_contrat ~ '^[a-z0-9_]{1,40}$');

update public.planning_modeles_contrat m
   set nom = v.nom, ordre = v.ordre, jour_max_minutes = v.jour_max,
       mineur_possible = v.mineur, forfait_possible = v.forfait,
       fin_obligatoire = v.fin
  from (values
    ('cdi',       'CDI',       0, null::integer, false, true,  false),
    ('cdd',       'CDD',       1, null,          false, true,  true),
    ('extra',     'Extra',     2, null,          false, false, false),
    ('stagiaire', 'Stagiaire', 3, 600,           true,  false, true),
    ('apprenti',  'Apprenti',  4, null,          true,  false, true)
  ) as v(code, nom, ordre, jour_max, mineur, forfait, fin)
 where m.type_contrat = v.code;

-- Un contrat ajouté avant cette migration (aucun aujourd'hui) garde sa clé
-- comme nom.
update public.planning_modeles_contrat set nom = type_contrat where nom is null;

alter table public.planning_modeles_contrat
  alter column nom set not null,
  add constraint planning_modeles_contrat_nom
    check (length(btrim(nom)) between 1 and 40);

create unique index planning_modeles_contrat_nom_unique
  on public.planning_modeles_contrat (lower(btrim(nom)));

comment on table public.planning_modeles_contrat is
  'Les types de contrat de l''établissement (créés, renommés, retirés dans Équipe) et leurs règles.';
comment on column public.planning_modeles_contrat.type_contrat is
  'Identifiant du contrat (jamais montré, jamais réécrit).';
comment on column public.planning_modeles_contrat.nom is 'Nom affiché du contrat.';
comment on column public.planning_modeles_contrat.jour_max_minutes is
  'Durée max d''un jour de travail pour ce contrat (null : celle du poste ; la loi borne à 12 h).';
comment on column public.planning_modeles_contrat.mineur_possible is
  'Une personne de ce contrat peut être déclarée mineure.';
comment on column public.planning_modeles_contrat.forfait_possible is
  'Une personne de ce contrat peut être cadre au forfait jours.';
comment on column public.planning_modeles_contrat.fin_obligatoire is
  'La fiche exige une fin de contrat.';

-- --------------------------------- 2. salariés : clé étrangère + trigger
alter table public.planning_salaries
  drop constraint planning_salaries_type_contrat_check,
  drop constraint planning_salaries_forfait_cadre,
  drop constraint planning_salaries_mineur_alternance;

alter table public.planning_salaries
  add constraint planning_salaries_type_contrat_fkey
    foreign key (type_contrat) references public.planning_modeles_contrat (type_contrat)
    on update cascade on delete restrict;

create or replace function private.planning_salarie_contrat_ok() returns trigger
  language plpgsql
  set search_path to ''
as $$
declare
  v public.planning_modeles_contrat%rowtype;
begin
  select * into v from public.planning_modeles_contrat where type_contrat = new.type_contrat;
  -- Contrat inconnu : la clé étrangère le refuse.
  if not found then return new; end if;
  if new.mineur and not v.mineur_possible then
    raise exception 'Un mineur ne peut pas avoir le contrat « % ».', v.nom
      using errcode = 'PL400';
  end if;
  if new.forfait_jours and not v.forfait_possible then
    raise exception 'Le contrat « % » ne permet pas le forfait jours.', v.nom
      using errcode = 'PL400';
  end if;
  return new;
end $$;
revoke all on function private.planning_salarie_contrat_ok() from public, anon, authenticated;

create trigger planning_salaries_contrat_ok
  before insert or update of type_contrat, mineur, forfait_jours
  on public.planning_salaries
  for each row execute function private.planning_salarie_contrat_ok();

-- Un modèle ne peut pas retirer une possibilité qu'une personne utilise, ni
-- disparaître tant qu'une fiche y renvoie (message en clair ; la clé
-- étrangère reste le filet).
create or replace function private.planning_modele_contrat_garde() returns trigger
  language plpgsql
  set search_path to ''
as $$
declare
  n integer;
begin
  if tg_op = 'DELETE' then
    select count(*) into n from public.planning_salaries where type_contrat = old.type_contrat;
    if n > 0 then
      raise exception 'Le contrat « % » est utilisé par % fiche(s) : changez d''abord leur contrat.', old.nom, n
        using errcode = 'PL409';
    end if;
    return old;
  end if;
  if old.mineur_possible and not new.mineur_possible
     and exists (select 1 from public.planning_salaries
                  where type_contrat = new.type_contrat and mineur) then
    raise exception 'Des personnes de ce contrat sont mineures : retirez-le d''abord de leur fiche.'
      using errcode = 'PL409';
  end if;
  if old.forfait_possible and not new.forfait_possible
     and exists (select 1 from public.planning_salaries
                  where type_contrat = new.type_contrat and forfait_jours) then
    raise exception 'Des personnes de ce contrat sont au forfait jours : retirez-le d''abord de leur fiche.'
      using errcode = 'PL409';
  end if;
  return new;
end $$;
revoke all on function private.planning_modele_contrat_garde() from public, anon, authenticated;

create trigger planning_modeles_contrat_garde
  before update or delete on public.planning_modeles_contrat
  for each row execute function private.planning_modele_contrat_garde();

-- ------------------------------------------ 3. groupes : forfait jours
alter table public.planning_groupes
  add column forfait_possible boolean not null default false;

comment on column public.planning_groupes.forfait_possible is
  'Les personnes de ce groupe peuvent être cadres au forfait jours (si leur contrat le permet).';

-- L'écran reconnaissait le groupe « Direction » par son nom : la case le
-- remplace, posée là où il était.
update public.planning_groupes
   set forfait_possible = true
 where lower(btrim(nom)) = 'direction';

-- ------------------------------------- 4. postes : durée max d'un service
alter table public.planning_postes
  add column jour_max_minutes integer not null default 690
    check (jour_max_minutes between 60 and 720);

comment on column public.planning_postes.jour_max_minutes is
  'Durée max d''un service sur ce poste (présence, minutes). La loi la borne à 12 h.';

update public.planning_postes
   set jour_max_minutes = case categorie
     when 'reception' then 720
     when 'veille_nuit' then 720
     when 'cuisine' then 660
     when 'administratif_hors_site' then 600
     else 690 end;

comment on column public.planning_postes.categorie is
  'ANCIENNE catégorie HCR, plus lue par le calcul depuis le 2026-11-06 (durée max : jour_max_minutes).';

-- ------------------------------------------------- 5. jours fériés
alter table public.planning_reglages
  add column ferie_anciennete_mois integer not null default 12
    check (ferie_anciennete_mois between 0 and 60),
  add column ferie_rattrapage_jours integer not null default 91
    check (ferie_rattrapage_jours between 7 and 182);

comment on column public.planning_reglages.ferie_anciennete_mois is
  'Ancienneté (mois) qui ouvre le rattrapage d''un jour férié travaillé.';
comment on column public.planning_reglages.ferie_rattrapage_jours is
  'Un jour férié travaillé reste à rattraper pendant ce nombre de jours.';
