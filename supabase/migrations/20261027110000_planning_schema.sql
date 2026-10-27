-- =====================================================================
-- PLANNING — schéma, RLS, garde des semaines verrouillées, RPC (2026-10-27)
-- =====================================================================
-- Portage du prototype `C:\Users\Pierre-Louis\Desktop\planning` (SQLite,
-- `backend/src/planning/db.py` v20) : plan `plan/planning-portage-2026-10-27/`.
--
-- Tables (une par table du prototype, mêmes noms métier) :
--   planning_groupes        catégories du staff (Direction, Hôteliers…)
--   planning_horaires       codes horaires (Matin 07:00 → 15:45, pause, journée courte)
--   planning_motifs         motifs d'absence (Congés, École…), nature absence | ecole
--   planning_postes         postes (catégorie réglementaire HCR, codes permis, à part)
--   planning_salaries       fiches du staff (contrat, compétences, semaine type…)
--   planning_absences       jours d'absence, UNE LIGNE PAR JOUR (D5 du plan)
--   planning_besoins        semaine type de l'hôtel (poste × jour × horaire × effectif)
--   planning_affectations   shifts d'une semaine (un seul par personne et par jour)
--   planning_semaines_verrouillees   plannings réalisés, figés
--
-- DROITS (D4) : niveau de la page `planning` (`private.planning_niveau()`) :
--   1 lecture  : tout lire ;
--   2 écriture : faire le planning — shifts, jours d'absence, générer, valider, vider ;
--   3 gestion  : en plus, paramétrer (équipe, postes, horaires, motifs, besoins,
--                catégories), verrouiller / déverrouiller, importer.
-- Aucun droit : aucune ligne lue, aucune écriture.
--
-- SEMAINE VERROUILLÉE (D6) : aucun shift ni jour d'absence d'une semaine
-- verrouillée ne change (trigger, errcode PL423), gestion comprise : on
-- déverrouille d'abord. Les cascades (suppression d'un poste, d'un salarié,
-- d'un code horaire) s'y heurtent aussi : c'est voulu, un planning réalisé ne
-- se détruit pas (le prototype refusait en 409 avec le même sens). PAS de
-- passe-droit pour un contexte sans utilisateur (clé service_role) : seul le
-- drapeau de transaction `planning.admin = 'on'` le lève.
--
-- Codes d'erreur propres (lus par `lib/planning/erreurs.ts`) :
--   PL423  semaine verrouillée          PL409  passé, ou planning changé entre-temps
--   PL400  demande invalide (message en clair)
-- =====================================================================

-- ------------------------------------------------------------------ aides
create or replace function private.planning_niveau() returns integer
  language sql stable
  set search_path to ''
as $$ select private.page_level_rank(private.get_page_level('planning')); $$;

-- « 07:00 », « 23:59 » ou « 24:00 » (minuit en fin de journée : la nuit courte
-- du dimanche qui commence à minuit).
create or replace function private.planning_heure_ok(p text) returns boolean
  language sql immutable
  set search_path to ''
as $$ select p ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'; $$;

create or replace function private.planning_minutes(p text) returns integer
  language sql immutable
  set search_path to ''
as $$ select split_part(p, ':', 1)::int * 60 + split_part(p, ':', 2)::int; $$;

-- Minutes de présence de debut à fin ; fin <= debut : le lendemain.
create or replace function private.planning_presence(p_debut text, p_fin text) returns integer
  language sql immutable
  set search_path to ''
as $$
  select case
    when private.planning_minutes(p_fin) <= private.planning_minutes(p_debut)
      then private.planning_minutes(p_fin) + 1440 - private.planning_minutes(p_debut)
    else private.planning_minutes(p_fin) - private.planning_minutes(p_debut)
  end;
$$;

create or replace function private.planning_hhmm(p_minutes integer) returns text
  language sql immutable
  set search_path to ''
as $$ select lpad((p_minutes / 60)::text, 2, '0') || ':' || lpad((p_minutes % 60)::text, 2, '0'); $$;

create or replace function private.planning_lundi(p date) returns date
  language sql immutable
  set search_path to ''
as $$ select p - (extract(isodow from p)::int - 1); $$;

-- Aujourd'hui à l'hôtel (heure de Paris).
create or replace function private.planning_aujourdhui() returns date
  language sql stable
  set search_path to ''
as $$ select (now() at time zone 'Europe/Paris')::date; $$;

-- Lecture de la table des verrous sans dépendre des droits de l'appelant (un
-- trigger de cascade doit la voir même pour un compte sans droit de lecture).
create or replace function private.planning_verrouillee(p_lundi date) returns boolean
  language plpgsql stable security definer
  set search_path to ''
as $$
begin
  return exists (select 1 from public.planning_semaines_verrouillees where lundi = p_lundi);
end $$;

-- Compétences : [{"poste_id": 3, "niveau": "titulaire" | "occasionnel" | "soutien"}].
create or replace function private.planning_competences_ok(p jsonb) returns boolean
  language sql immutable
  set search_path to ''
as $$
  select jsonb_typeof(p) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or jsonb_typeof(e -> 'poste_id') <> 'number'
           or coalesce(e ->> 'niveau', '') not in ('titulaire', 'occasionnel', 'soutien'));
$$;

-- Semaine type : 7 jours {"mode": auto|travail|repos|absence, "type_shift_id",
-- "type_absence_id", "etoile"} (mêmes clés que le prototype).
create or replace function private.planning_semaine_type_ok(p jsonb) returns boolean
  language sql immutable
  set search_path to ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) = 7
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(e ->> 'mode', '') not in ('auto', 'travail', 'repos', 'absence'));
$$;

revoke all on function private.planning_niveau() from public;
revoke all on function private.planning_heure_ok(text) from public;
revoke all on function private.planning_minutes(text) from public;
revoke all on function private.planning_presence(text, text) from public;
revoke all on function private.planning_hhmm(integer) from public;
revoke all on function private.planning_lundi(date) from public;
revoke all on function private.planning_aujourdhui() from public;
revoke all on function private.planning_verrouillee(date) from public;
revoke all on function private.planning_competences_ok(jsonb) from public;
revoke all on function private.planning_semaine_type_ok(jsonb) from public;
grant execute on function private.planning_niveau() to authenticated, service_role;
grant execute on function private.planning_heure_ok(text) to authenticated, service_role;
grant execute on function private.planning_minutes(text) to authenticated, service_role;
grant execute on function private.planning_presence(text, text) to authenticated, service_role;
grant execute on function private.planning_hhmm(integer) to authenticated, service_role;
grant execute on function private.planning_lundi(date) to authenticated, service_role;
grant execute on function private.planning_aujourdhui() to authenticated, service_role;
grant execute on function private.planning_verrouillee(date) to authenticated, service_role;
grant execute on function private.planning_competences_ok(jsonb) to authenticated, service_role;
grant execute on function private.planning_semaine_type_ok(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- tables
create table public.planning_groupes (
  id bigint generated always as identity primary key,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  ordre integer not null default 0,
  postes_autorises bigint[] not null default '{}',  -- vide = tous les postes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.planning_horaires (
  id bigint generated always as identity primary key,
  code text not null check (length(btrim(code)) between 1 and 4),
  nom text not null check (length(btrim(nom)) between 1 and 80),
  debut text not null check (private.planning_heure_ok(debut)),
  fin text not null check (private.planning_heure_ok(fin)),
  couleur text not null default '#5b8def' check (couleur ~ '^#[0-9a-fA-F]{6}$'),
  pause integer not null default 0 check (pause between 0 and 180),
  raccourci integer not null default 0 check (raccourci between 0 and 240),
  raccourci_debut integer not null default 0 check (raccourci_debut between 0 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_horaires_raccourci_debut check (raccourci_debut <= raccourci),
  constraint planning_horaires_pause check (pause < private.planning_presence(debut, fin)),
  constraint planning_horaires_court check (
    raccourci < private.planning_presence(debut, fin) - pause)
);

create table public.planning_motifs (
  id bigint generated always as identity primary key,
  code text not null check (length(btrim(code)) between 1 and 4),
  nom text not null check (length(btrim(nom)) between 1 and 80),
  couleur text not null default '#94a3b8' check (couleur ~ '^#[0-9a-fA-F]{6}$'),
  decompte boolean not null default true,  -- compté dans les heures (R-ABSENCE-HEURES)
  nature text not null default 'absence' check (nature in ('absence', 'ecole')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.planning_postes (
  id bigint generated always as identity primary key,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  categorie text not null default 'autre'
    check (categorie in ('reception', 'veille_nuit', 'cuisine', 'administratif_hors_site', 'autre')),
  couleur text not null default '#5b8def' check (couleur ~ '^#[0-9a-fA-F]{6}$'),
  horaires_autorises bigint[] not null default '{}',  -- vide = tous les codes
  a_part boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.planning_salaries (
  id bigint generated always as identity primary key,
  prenom text not null check (length(btrim(prenom)) between 1 and 80),
  nom text not null default '' check (length(nom) <= 80),
  groupe_id bigint references public.planning_groupes (id) on delete set null,
  type_contrat text not null default 'cdi'
    check (type_contrat in ('cdi', 'cdd', 'extra', 'stagiaire', 'apprenti')),
  heures_hebdo numeric(5, 2) not null default 39 check (heures_hebdo between 0 and 48),
  forfait_jours boolean not null default false,
  mineur boolean not null default false,
  competences jsonb not null default '[]' check (private.planning_competences_ok(competences)),
  semaine_type jsonb not null default
    '[{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"},{"mode":"auto"}]'
    check (private.planning_semaine_type_ok(semaine_type)),
  shifts_autorises bigint[] not null default '{}',  -- vide = tous
  date_entree date,
  date_sortie date,
  actif boolean not null default true,
  suite_de bigint references public.planning_salaries (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_salaries_dates check (
    date_entree is null or date_sortie is null or date_sortie >= date_entree),
  constraint planning_salaries_suite check (suite_de is distinct from id)
);

create table public.planning_absences (
  id bigint generated always as identity primary key,
  salarie_id bigint not null references public.planning_salaries (id) on delete cascade,
  jour date not null,
  motif_id bigint not null references public.planning_motifs (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint planning_absences_un_par_jour unique (salarie_id, jour)
);

create table public.planning_besoins (
  id bigint generated always as identity primary key,
  poste_id bigint not null references public.planning_postes (id) on delete cascade,
  jour smallint not null check (jour between 0 and 6),
  horaire_id bigint references public.planning_horaires (id) on delete cascade,
  debut text not null default '09:00' check (private.planning_heure_ok(debut)),
  fin text not null default '17:00' check (private.planning_heure_ok(fin)),
  effectif integer not null default 1 check (effectif between 0 and 20),
  soutien integer not null default 1 check (soutien between 0 and 5),
  renfort integer not null default 0 check (renfort between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index planning_besoins_code_unique
  on public.planning_besoins (poste_id, jour, horaire_id) where horaire_id is not null;
create unique index planning_besoins_libre_unique
  on public.planning_besoins (poste_id, jour, debut, fin) where horaire_id is null;

create table public.planning_semaines_verrouillees (
  lundi date primary key check (extract(isodow from lundi) = 1),
  id bigint generated always as identity unique,  -- pour le journal (log_row_change)
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create table public.planning_affectations (
  id bigint generated always as identity primary key,
  lundi date not null check (extract(isodow from lundi) = 1),
  salarie_id bigint not null references public.planning_salaries (id) on delete cascade,
  poste_id bigint not null references public.planning_postes (id) on delete cascade,
  jour smallint not null check (jour between 0 and 6),
  horaire_id bigint references public.planning_horaires (id) on delete set null,
  debut text not null check (private.planning_heure_ok(debut)),
  fin text not null check (private.planning_heure_ok(fin)),
  epinglee boolean not null default false,  -- validé : la génération le garde
  court boolean not null default false,     -- journée courte (fin avancée)
  pause integer not null default 0 check (pause between 0 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint planning_affectations_pause check (pause < private.planning_presence(debut, fin)),
  -- Un seul shift par personne et par jour. Différable : un échange de deux
  -- shifts (glisser-déposer sur une case occupée) se fait en une transaction.
  constraint planning_affectations_un_par_jour unique (lundi, salarie_id, jour)
    deferrable initially immediate
);
create index planning_affectations_salarie_idx on public.planning_affectations (salarie_id);
create index planning_affectations_poste_idx on public.planning_affectations (poste_id);
create index planning_affectations_horaire_idx on public.planning_affectations (horaire_id);
create index planning_absences_jour_idx on public.planning_absences (jour);
create index planning_absences_motif_idx on public.planning_absences (motif_id);
create index planning_besoins_horaire_idx on public.planning_besoins (horaire_id);
create index planning_salaries_groupe_idx on public.planning_salaries (groupe_id);
create index planning_salaries_suite_idx on public.planning_salaries (suite_de);

-- ------------------------------------------------------------ estampille
create or replace function private.planning_stamp() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  new.updated_at := now();
  if tg_table_name in ('planning_affectations', 'planning_absences') then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    else
      new.created_by := private.keep_author(new.created_by, old.created_by);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.planning_stamp() from public, anon, authenticated;

create trigger planning_groupes_stamp before insert or update on public.planning_groupes
  for each row execute function private.planning_stamp();
create trigger planning_horaires_stamp before insert or update on public.planning_horaires
  for each row execute function private.planning_stamp();
create trigger planning_motifs_stamp before insert or update on public.planning_motifs
  for each row execute function private.planning_stamp();
create trigger planning_postes_stamp before insert or update on public.planning_postes
  for each row execute function private.planning_stamp();
create trigger planning_salaries_stamp before insert or update on public.planning_salaries
  for each row execute function private.planning_stamp();
create trigger planning_absences_stamp before insert or update on public.planning_absences
  for each row execute function private.planning_stamp();
create trigger planning_besoins_stamp before insert or update on public.planning_besoins
  for each row execute function private.planning_stamp();
create trigger planning_affectations_stamp before insert or update on public.planning_affectations
  for each row execute function private.planning_stamp();

create or replace function private.planning_verrou_stamp() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
revoke all on function private.planning_verrou_stamp() from public, anon, authenticated;
create trigger planning_verrous_stamp before insert on public.planning_semaines_verrouillees
  for each row execute function private.planning_verrou_stamp();

-- ------------------------------------------- semaine verrouillée : figée
create or replace function private.planning_garde_verrou() returns trigger
  language plpgsql
  set search_path to ''
as $$
declare
  v_avant date;
  v_apres date;
begin
  -- Aucune porte dérobée « sans utilisateur » (une fonction serveur à la clé
  -- service_role ne détruit pas plus un planning réalisé) : seul un drapeau
  -- posé exprès, le temps d'une transaction d'administration, la lève
  -- (`set local planning.admin = 'on'`). Revue du binôme du 2026-10-27.
  if current_setting('planning.admin', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Seule la trace de l'auteur change (compte supprimé : FK `set null`) :
  -- ce n'est pas une retouche du planning, sinon supprimer un compte qui a
  -- posé un shift réalisé deviendrait impossible.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'created_by' - 'updated_at') = (to_jsonb(old) - 'created_by' - 'updated_at') then
    return new;
  end if;
  if tg_table_name = 'planning_affectations' then
    if tg_op <> 'INSERT' then v_avant := old.lundi; end if;
    if tg_op <> 'DELETE' then v_apres := new.lundi; end if;
  else
    if tg_op <> 'INSERT' then v_avant := private.planning_lundi(old.jour); end if;
    if tg_op <> 'DELETE' then v_apres := private.planning_lundi(new.jour); end if;
  end if;
  if (v_avant is not null and private.planning_verrouillee(v_avant))
     or (v_apres is not null and private.planning_verrouillee(v_apres)) then
    raise exception 'Semaine verrouillée : c''est un planning réalisé. Déverrouillez-la d''abord.'
      using errcode = 'PL423';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function private.planning_garde_verrou() from public, anon, authenticated;

create trigger planning_affectations_verrou
  before insert or update or delete on public.planning_affectations
  for each row execute function private.planning_garde_verrou();
create trigger planning_absences_verrou
  before insert or update or delete on public.planning_absences
  for each row execute function private.planning_garde_verrou();

-- Un jour devenu absent n'a plus de shift (prototype : poser_absence et
-- modifier_salarie). La personne n'est jamais planifiée à l'hôtel ce jour-là.
create or replace function private.planning_absence_retire_shift() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  delete from public.planning_affectations
   where salarie_id = new.salarie_id
     and lundi = private.planning_lundi(new.jour)
     and jour = extract(isodow from new.jour)::int - 1;
  return null;
end $$;
revoke all on function private.planning_absence_retire_shift() from public, anon, authenticated;
create trigger planning_absences_retire_shift
  after insert or update of jour, salarie_id on public.planning_absences
  for each row execute function private.planning_absence_retire_shift();

-- ----------------------------------- compétences permises par la catégorie
-- Prototype `_verifier_competences` (400) : un poste hors de ceux que sa
-- catégorie permet est refusé ; une catégorie qui restreint ses postes retire
-- à ses membres les compétences qu'elle ne permet plus.
create or replace function private.planning_salaries_competences() returns trigger
  language plpgsql
  set search_path to ''
as $$
declare
  v_permis bigint[];
  v_hors text;
begin
  if new.groupe_id is null then return new; end if;
  select postes_autorises into v_permis from public.planning_groupes where id = new.groupe_id;
  if coalesce(cardinality(v_permis), 0) = 0 then return new; end if;
  select string_agg(coalesce(p.nom, '?'), ', ') into v_hors
    from jsonb_array_elements(new.competences) e
    left join public.planning_postes p on p.id = (e ->> 'poste_id')::bigint
   where not ((e ->> 'poste_id')::bigint = any (v_permis));
  if v_hors is not null then
    raise exception 'Poste non prévu pour cette catégorie : %.', v_hors using errcode = 'PL400';
  end if;
  return new;
end $$;
revoke all on function private.planning_salaries_competences() from public, anon, authenticated;
create trigger planning_salaries_competences
  before insert or update of competences, groupe_id on public.planning_salaries
  for each row execute function private.planning_salaries_competences();

create or replace function private.planning_groupes_postes() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if coalesce(cardinality(new.postes_autorises), 0) > 0
     and new.postes_autorises is distinct from old.postes_autorises then
    update public.planning_salaries x
       set competences = coalesce((
         select jsonb_agg(e) from jsonb_array_elements(x.competences) e
          where (e ->> 'poste_id')::bigint = any (new.postes_autorises)), '[]'::jsonb)
     where x.groupe_id = new.id;
  end if;
  return null;
end $$;
revoke all on function private.planning_groupes_postes() from public, anon, authenticated;
create trigger planning_groupes_postes
  after update of postes_autorises on public.planning_groupes
  for each row execute function private.planning_groupes_postes();

-- ------------------------- code horaire modifié : les shifts à venir suivent
-- Prototype `modifier_horaire` : les shifts de ce code prennent ses nouvelles
-- heures et sa pause, SAUF ceux des semaines verrouillées (ce qui a été fait
-- ne change pas).
create or replace function private.planning_horaire_de(
  p_debut text, p_fin text, p_raccourci integer, p_raccourci_debut integer, p_court boolean,
  out debut text, out fin text)
  language plpgsql immutable
  set search_path to ''
as $$
begin
  if not (p_court and p_raccourci > 0) then
    debut := p_debut; fin := p_fin; return;
  end if;
  debut := case when p_raccourci_debut > 0
    then private.planning_hhmm(private.planning_minutes(p_debut) + p_raccourci_debut)
    else p_debut end;
  fin := private.planning_hhmm(
    ((private.planning_minutes(p_fin) - (p_raccourci - p_raccourci_debut)) % 1440 + 1440) % 1440);
end $$;
revoke all on function private.planning_horaire_de(text, text, integer, integer, boolean) from public;
grant execute on function private.planning_horaire_de(text, text, integer, integer, boolean)
  to authenticated, service_role;

create or replace function private.planning_horaires_suivent() returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  if (new.debut, new.fin, new.pause, new.raccourci, new.raccourci_debut)
     is distinct from (old.debut, old.fin, old.pause, old.raccourci, old.raccourci_debut) then
    update public.planning_affectations a
       set court = a.court and new.raccourci > 0,
           debut = (private.planning_horaire_de(new.debut, new.fin, new.raccourci,
                     new.raccourci_debut, a.court and new.raccourci > 0)).debut,
           fin = (private.planning_horaire_de(new.debut, new.fin, new.raccourci,
                   new.raccourci_debut, a.court and new.raccourci > 0)).fin,
           pause = new.pause
     where a.horaire_id = new.id
       and not private.planning_verrouillee(a.lundi);
    update public.planning_besoins set debut = new.debut, fin = new.fin
     where horaire_id = new.id;
  end if;
  return null;
end $$;
revoke all on function private.planning_horaires_suivent() from public, anon, authenticated;
create trigger planning_horaires_suivent
  after update on public.planning_horaires
  for each row execute function private.planning_horaires_suivent();

-- -------------------------------------------------------------------- RLS
alter table public.planning_groupes enable row level security;
alter table public.planning_horaires enable row level security;
alter table public.planning_motifs enable row level security;
alter table public.planning_postes enable row level security;
alter table public.planning_salaries enable row level security;
alter table public.planning_absences enable row level security;
alter table public.planning_besoins enable row level security;
alter table public.planning_semaines_verrouillees enable row level security;
alter table public.planning_affectations enable row level security;

-- Lecture : rang >= 1 sur toutes les tables.
create policy "planning_groupes read (page:planning)" on public.planning_groupes
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_horaires read (page:planning)" on public.planning_horaires
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_motifs read (page:planning)" on public.planning_motifs
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_postes read (page:planning)" on public.planning_postes
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_salaries read (page:planning)" on public.planning_salaries
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_absences read (page:planning)" on public.planning_absences
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_besoins read (page:planning)" on public.planning_besoins
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_verrous read (page:planning)" on public.planning_semaines_verrouillees
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_affectations read (page:planning)" on public.planning_affectations
  for select to authenticated using ((select private.planning_niveau()) >= 1);

-- Paramétrage : gestion (rang 3).
create policy "planning_groupes insert (page:planning)" on public.planning_groupes
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_groupes update (page:planning)" on public.planning_groupes
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_groupes delete (page:planning)" on public.planning_groupes
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

create policy "planning_horaires insert (page:planning)" on public.planning_horaires
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_horaires update (page:planning)" on public.planning_horaires
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_horaires delete (page:planning)" on public.planning_horaires
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

create policy "planning_motifs insert (page:planning)" on public.planning_motifs
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_motifs update (page:planning)" on public.planning_motifs
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_motifs delete (page:planning)" on public.planning_motifs
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

create policy "planning_postes insert (page:planning)" on public.planning_postes
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_postes update (page:planning)" on public.planning_postes
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_postes delete (page:planning)" on public.planning_postes
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

create policy "planning_salaries insert (page:planning)" on public.planning_salaries
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_salaries update (page:planning)" on public.planning_salaries
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_salaries delete (page:planning)" on public.planning_salaries
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

create policy "planning_besoins insert (page:planning)" on public.planning_besoins
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_besoins update (page:planning)" on public.planning_besoins
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_besoins delete (page:planning)" on public.planning_besoins
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

create policy "planning_verrous insert (page:planning)" on public.planning_semaines_verrouillees
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_verrous delete (page:planning)" on public.planning_semaines_verrouillees
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

-- Le planning lui-même : écriture (rang 2).
create policy "planning_affectations insert (page:planning)" on public.planning_affectations
  for insert to authenticated with check ((select private.planning_niveau()) >= 2);
create policy "planning_affectations update (page:planning)" on public.planning_affectations
  for update to authenticated using ((select private.planning_niveau()) >= 2)
  with check ((select private.planning_niveau()) >= 2);
create policy "planning_affectations delete (page:planning)" on public.planning_affectations
  for delete to authenticated using ((select private.planning_niveau()) >= 2);

create policy "planning_absences insert (page:planning)" on public.planning_absences
  for insert to authenticated with check ((select private.planning_niveau()) >= 2);
create policy "planning_absences update (page:planning)" on public.planning_absences
  for update to authenticated using ((select private.planning_niveau()) >= 2)
  with check ((select private.planning_niveau()) >= 2);
create policy "planning_absences delete (page:planning)" on public.planning_absences
  for delete to authenticated using ((select private.planning_niveau()) >= 2);

grant select, insert, update, delete on public.planning_groupes to authenticated;
grant select, insert, update, delete on public.planning_horaires to authenticated;
grant select, insert, update, delete on public.planning_motifs to authenticated;
grant select, insert, update, delete on public.planning_postes to authenticated;
grant select, insert, update, delete on public.planning_salaries to authenticated;
grant select, insert, update, delete on public.planning_absences to authenticated;
grant select, insert, update, delete on public.planning_besoins to authenticated;
grant select, insert, delete on public.planning_semaines_verrouillees to authenticated;
grant select, insert, update, delete on public.planning_affectations to authenticated;
grant all on public.planning_groupes, public.planning_horaires, public.planning_motifs,
  public.planning_postes, public.planning_salaries, public.planning_absences,
  public.planning_besoins, public.planning_semaines_verrouillees,
  public.planning_affectations to service_role;

-- Journal : fiches du staff et verrous (qui a verrouillé, déverrouillé).
create trigger audit_planning_salaries after insert or delete or update
  on public.planning_salaries for each row execute function private.log_row_change();
create trigger audit_planning_verrous after insert or delete
  on public.planning_semaines_verrouillees for each row execute function private.log_row_change();

-- ===================================================================== RPC
-- Toutes `security invoker` : les RLS et les triggers ci-dessus s'appliquent
-- à l'appelant. Elles ne font qu'enchaîner en UNE transaction ce que le
-- client pourrait faire en plusieurs requêtes.

-- Planning de la semaine changé depuis la lecture du client ?
create or replace function private.planning_etat(p_lundi date) returns text
  language sql stable
  set search_path to ''
as $$
  select count(*)::text || '|' || coalesce(max(updated_at)::text, '-')
    from public.planning_affectations where lundi = p_lundi;
$$;
revoke all on function private.planning_etat(date) from public;
grant execute on function private.planning_etat(date) to authenticated, service_role;

create or replace function public.planning_etat_semaine(p_lundi date) returns text
  language sql stable security invoker
  set search_path to ''
as $$ select private.planning_etat(p_lundi); $$;

-- Premier jour qu'on peut encore créer dans la semaine : 0 pour une semaine à
-- venir ; dans la semaine en cours, aujourd'hui ; une semaine passée : refus.
create or replace function private.planning_depuis(p_lundi date) returns integer
  language plpgsql stable
  set search_path to ''
as $$
declare v_auj date := private.planning_aujourdhui();
begin
  if p_lundi < private.planning_lundi(v_auj) then
    raise exception 'On ne touche pas au passé : cette semaine est terminée.' using errcode = 'PL409';
  end if;
  return greatest(0, least(7, v_auj - p_lundi));
end $$;
revoke all on function private.planning_depuis(date) from public;
grant execute on function private.planning_depuis(date) to authenticated, service_role;

-- Applique une génération calculée par le client (solveur HiGHS) :
--   1. efface les propositions des jours à venir (tout, même validé, si
--      p_tout ; les shifts des p_exclus même validés), sauf si p_sans_effacer ;
--   2. pose les nouveaux shifts (non validés), en sautant un jour devenu absent.
-- p_etat : `planning_etat_semaine` lu par le client au départ ; s'il a changé,
-- refus (quelqu'un a modifié le planning pendant le calcul).
-- p_depuis : premier jour que le client a cru pouvoir créer ; s'il diffère de
-- celui de la base (horloge du poste, minuit passé pendant le calcul), refus :
-- sinon la base effacerait des propositions que le client a gardées.
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
  end if;
  insert into public.planning_affectations
    (lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, epinglee, court, pause)
  select p_lundi, (n ->> 'salarie_id')::bigint, (n ->> 'poste_id')::bigint,
         (n ->> 'jour')::smallint, nullif(n ->> 'horaire_id', '')::bigint,
         n ->> 'debut', n ->> 'fin', false, coalesce((n ->> 'court')::boolean, false),
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

-- Efface les shifts d'une semaine (ou seulement les propositions). Jamais le
-- passé : semaine terminée refusée, semaine en cours à partir d'aujourd'hui.
create or replace function public.planning_vider(p_lundi date, p_garder_epinglees boolean)
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
  delete from public.planning_affectations
   where lundi = p_lundi and jour >= v_depuis
     and (not coalesce(p_garder_epinglees, false) or not epinglee);
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
    court = coalesce((p_maj ->> 'court')::boolean, court),
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

-- Déplace un jour non travaillé (absence posée ou repos) vers une autre case
-- (prototype `deplacer_statut`). Sur la même ligne : échange avec le travail du
-- jour visé. Vers quelqu'un d'autre : seule une absence se déplace. Les jours
-- fixes de la semaine type (repos fixe, absence fixe) ne bougent pas ici.
create or replace function public.planning_deplacer_statut(
  p_lundi date, p_salarie bigint, p_jour integer, p_vers_salarie bigint, p_vers_jour integer)
  returns void
  language plpgsql security invoker
  set search_path to ''
as $$
declare
  v_depart date := p_lundi + p_jour;
  v_arrivee date := p_lundi + p_vers_jour;
  v_motif bigint;
  v_motif_arrivee bigint;
  v_fixe boolean;
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  if p_jour not between 0 and 6 or p_vers_jour not between 0 and 6 then
    raise exception 'Jour invalide.' using errcode = 'PL400';
  end if;
  perform pg_advisory_xact_lock(hashtext('planning:' || p_lundi::text));
  select exists (
    select 1 from public.planning_salaries x
     where (x.id = p_salarie and x.semaine_type -> p_jour ->> 'mode' in ('repos', 'absence'))
        or (x.id = p_vers_salarie and x.semaine_type -> p_vers_jour ->> 'mode' in ('repos', 'absence')))
    into v_fixe;
  if v_fixe then
    raise exception 'Jour fixe de la semaine type : à changer dans la fiche.' using errcode = 'PL409';
  end if;
  select motif_id into v_motif from public.planning_absences
   where salarie_id = p_salarie and jour = v_depart;
  if p_salarie = p_vers_salarie then
    if p_jour = p_vers_jour then return; end if;
    select motif_id into v_motif_arrivee from public.planning_absences
     where salarie_id = p_salarie and jour = v_arrivee;
    delete from public.planning_absences
     where salarie_id = p_salarie and jour in (v_depart, v_arrivee);
    set constraints public.planning_affectations_un_par_jour deferred;
    update public.planning_affectations
       set jour = case when jour = p_jour then p_vers_jour else p_jour end, epinglee = true
     where lundi = p_lundi and salarie_id = p_salarie and jour in (p_jour, p_vers_jour);
    set constraints public.planning_affectations_un_par_jour immediate;
    if v_motif is not null then
      insert into public.planning_absences (salarie_id, jour, motif_id)
      values (p_salarie, v_arrivee, v_motif);
    end if;
    if v_motif_arrivee is not null then
      insert into public.planning_absences (salarie_id, jour, motif_id)
      values (p_salarie, v_depart, v_motif_arrivee);
    end if;
  else
    if v_motif is null then
      raise exception 'Un repos se déplace sur la même ligne.' using errcode = 'PL400';
    end if;
    delete from public.planning_absences where salarie_id = p_salarie and jour = v_depart;
    insert into public.planning_absences (salarie_id, jour, motif_id)
    values (p_vers_salarie, v_arrivee, v_motif)
    on conflict (salarie_id, jour) do update set motif_id = excluded.motif_id;
    -- Le trigger d'insertion retire le shift ; une mise à jour (motif changé)
    -- ne déclenche pas le retrait : on le fait ici.
    delete from public.planning_affectations
     where lundi = p_lundi and salarie_id = p_vers_salarie and jour = p_vers_jour;
  end if;
end $$;

-- Pose (ou remplace) le motif d'absence de jours d'une personne ; p_motif nul :
-- retire l'absence de ces jours. Les shifts de ces jours sont retirés.
create or replace function public.planning_poser_absences(
  p_salarie bigint, p_jours date[], p_motif bigint)
  returns void
  language plpgsql security invoker
  set search_path to ''
as $$
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  delete from public.planning_absences where salarie_id = p_salarie and jour = any (p_jours);
  if p_motif is not null then
    insert into public.planning_absences (salarie_id, jour, motif_id)
    select p_salarie, j, p_motif from unnest(p_jours) j;
  end if;
end $$;

-- Valide (épingle) les shifts d'une case, d'une journée, d'une personne ou de
-- toute la semaine, ou les remet en proposition.
create or replace function public.planning_valider(
  p_lundi date, p_salarie bigint, p_jour integer, p_epinglee boolean)
  returns integer
  language plpgsql security invoker
  set search_path to ''
as $$
declare v_n integer;
begin
  if private.planning_niveau() < 2 then
    raise exception 'Droit d''écriture sur le planning requis.' using errcode = '42501';
  end if;
  update public.planning_affectations set epinglee = p_epinglee
   where lundi = p_lundi
     and (p_salarie is null or salarie_id = p_salarie)
     and (p_jour is null or jour = p_jour)
     and epinglee is distinct from p_epinglee;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- -------------------------------------------- suppressions avec cascades
-- Une liste de restriction vidée voudrait dire « tout permis » : refus.
create or replace function public.planning_supprimer_horaire(p_id bigint) returns void
  language plpgsql security invoker
  set search_path to ''
as $$
declare
  v_code text;
  v_qui text;
begin
  if private.planning_niveau() < 3 then
    raise exception 'Réservé à la gestion du planning.' using errcode = '42501';
  end if;
  select code into v_code from public.planning_horaires where id = p_id;
  if v_code is null then return; end if;
  if exists (select 1 from public.planning_affectations a
              where a.horaire_id = p_id and private.planning_verrouillee(a.lundi)) then
    raise exception 'Le code % figure dans des plannings réalisés : il ne peut plus être supprimé.', v_code
      using errcode = 'PL409';
  end if;
  select string_agg(q, ', ') into v_qui from (
    select 'la fiche de ' || btrim(prenom || ' ' || nom) as q from public.planning_salaries
     where shifts_autorises = array[p_id]
    union all
    select 'le poste ' || nom from public.planning_postes where horaires_autorises = array[p_id]) t;
  if v_qui is not null then
    raise exception 'Le code % est le seul horaire permis pour %. Ajoutez d''abord un autre horaire à ces listes.',
      v_code, v_qui using errcode = 'PL409';
  end if;
  update public.planning_salaries set
    shifts_autorises = array_remove(shifts_autorises, p_id),
    semaine_type = (select jsonb_agg(case when (e ->> 'type_shift_id')::bigint = p_id
                                          then e || '{"type_shift_id": null}'::jsonb else e end
                                     order by o)
                      from jsonb_array_elements(semaine_type) with ordinality as t(e, o))
   where p_id = any (shifts_autorises)
      or exists (select 1 from jsonb_array_elements(semaine_type) e
                  where (e ->> 'type_shift_id')::bigint = p_id);
  update public.planning_postes set horaires_autorises = array_remove(horaires_autorises, p_id)
   where p_id = any (horaires_autorises);
  -- Besoins : supprimés (FK en cascade) ; shifts : gardent leurs heures, sans code.
  delete from public.planning_horaires where id = p_id;
end $$;

create or replace function public.planning_supprimer_poste(p_id bigint) returns void
  language plpgsql security invoker
  set search_path to ''
as $$
declare
  v_nom text;
  v_qui text;
begin
  if private.planning_niveau() < 3 then
    raise exception 'Réservé à la gestion du planning.' using errcode = '42501';
  end if;
  select nom into v_nom from public.planning_postes where id = p_id;
  if v_nom is null then return; end if;
  if exists (select 1 from public.planning_affectations a
              where a.poste_id = p_id and private.planning_verrouillee(a.lundi)) then
    raise exception 'Le poste % figure dans des plannings réalisés : il ne peut plus être supprimé.', v_nom
      using errcode = 'PL409';
  end if;
  select string_agg(nom, ', ') into v_qui from public.planning_groupes
   where postes_autorises = array[p_id];
  if v_qui is not null then
    raise exception 'Le poste % est le seul permis pour la catégorie %. Ajoutez d''abord un autre poste à cette catégorie.',
      v_nom, v_qui using errcode = 'PL409';
  end if;
  update public.planning_salaries set competences = coalesce((
    select jsonb_agg(e) from jsonb_array_elements(competences) e
     where (e ->> 'poste_id')::bigint <> p_id), '[]'::jsonb)
   where exists (select 1 from jsonb_array_elements(competences) e
                  where (e ->> 'poste_id')::bigint = p_id);
  update public.planning_groupes set postes_autorises = array_remove(postes_autorises, p_id)
   where p_id = any (postes_autorises);
  delete from public.planning_postes where id = p_id;  -- besoins et shifts en cascade
end $$;

create or replace function public.planning_supprimer_motif(p_id bigint) returns void
  language plpgsql security invoker
  set search_path to ''
as $$
declare v_nom text;
begin
  if private.planning_niveau() < 3 then
    raise exception 'Réservé à la gestion du planning.' using errcode = '42501';
  end if;
  select nom into v_nom from public.planning_motifs where id = p_id;
  if v_nom is null then return; end if;
  if exists (select 1 from public.planning_absences ab
              where ab.motif_id = p_id and private.planning_verrouillee(private.planning_lundi(ab.jour))) then
    raise exception 'Le motif % figure dans des plannings réalisés : il ne peut plus être supprimé.', v_nom
      using errcode = 'PL409';
  end if;
  -- La semaine type repasse en « libre » là où elle utilisait ce motif.
  update public.planning_salaries set semaine_type = (
    select jsonb_agg(case when (e ->> 'type_absence_id')::bigint = p_id
                          then '{"mode": "auto"}'::jsonb else e end order by o)
      from jsonb_array_elements(semaine_type) with ordinality as t(e, o))
   where exists (select 1 from jsonb_array_elements(semaine_type) e
                  where (e ->> 'type_absence_id')::bigint = p_id);
  delete from public.planning_motifs where id = p_id;  -- jours d'absence en cascade
end $$;

-- Supprime une fiche ; refusée si la personne figure dans un planning réalisé.
create or replace function public.planning_supprimer_salarie(p_id bigint) returns void
  language plpgsql security invoker
  set search_path to ''
as $$
begin
  if private.planning_niveau() < 3 then
    raise exception 'Réservé à la gestion du planning.' using errcode = '42501';
  end if;
  if exists (select 1 from public.planning_affectations a
              where a.salarie_id = p_id and private.planning_verrouillee(a.lundi))
     or exists (select 1 from public.planning_absences ab
                 where ab.salarie_id = p_id
                   and private.planning_verrouillee(private.planning_lundi(ab.jour))) then
    raise exception 'Cette personne figure dans des plannings réalisés : indiquez plutôt sa fin de contrat dans sa fiche.'
      using errcode = 'PL409';
  end if;
  delete from public.planning_salaries where id = p_id;
end $$;

revoke all on function public.planning_etat_semaine(date) from public, anon;
revoke all on function public.planning_appliquer_generation(date, text, integer, boolean, bigint[], boolean, jsonb) from public, anon;
revoke all on function public.planning_vider(date, boolean) from public, anon;
revoke all on function public.planning_modifier_shift(bigint, jsonb) from public, anon;
revoke all on function public.planning_deplacer_statut(date, bigint, integer, bigint, integer) from public, anon;
revoke all on function public.planning_poser_absences(bigint, date[], bigint) from public, anon;
revoke all on function public.planning_valider(date, bigint, integer, boolean) from public, anon;
revoke all on function public.planning_supprimer_horaire(bigint) from public, anon;
revoke all on function public.planning_supprimer_poste(bigint) from public, anon;
revoke all on function public.planning_supprimer_motif(bigint) from public, anon;
revoke all on function public.planning_supprimer_salarie(bigint) from public, anon;
grant execute on function public.planning_etat_semaine(date) to authenticated, service_role;
grant execute on function public.planning_appliquer_generation(date, text, integer, boolean, bigint[], boolean, jsonb) to authenticated, service_role;
grant execute on function public.planning_vider(date, boolean) to authenticated, service_role;
grant execute on function public.planning_modifier_shift(bigint, jsonb) to authenticated, service_role;
grant execute on function public.planning_deplacer_statut(date, bigint, integer, bigint, integer) to authenticated, service_role;
grant execute on function public.planning_poser_absences(bigint, date[], bigint) to authenticated, service_role;
grant execute on function public.planning_valider(date, bigint, integer, boolean) to authenticated, service_role;
grant execute on function public.planning_supprimer_horaire(bigint) to authenticated, service_role;
grant execute on function public.planning_supprimer_poste(bigint) to authenticated, service_role;
grant execute on function public.planning_supprimer_motif(bigint) to authenticated, service_role;
grant execute on function public.planning_supprimer_salarie(bigint) to authenticated, service_role;
