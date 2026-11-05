-- Règles de l'établissement rangées en base (plan
-- `planning-moteur-configurable-2026-11-05`, étape 3 ; décisions D1-D11,
-- partie C de `D-decisions.md`). AJOUTS SEULEMENT : aucune colonne retirée ni
-- renommée. Les valeurs par défaut sont EXACTEMENT celles de
-- `REGLES_PAR_DEFAUT` (`src/lib/planning/reglesEtablissement.ts`) : personne
-- ne voit son planning changer. Le moteur ne lit pas encore ces colonnes
-- (étape 4) ; la LOI (11 h, 48 h, 6 jours, mineurs) reste dans le code, et
-- aucune borne ci-dessous ne permet de descendre sous elle.
--
-- 1. planning_reglages (une ligne, update = gestion, déjà couvert) : les
--    règles globales — repos et rythme, passations, limites des moments
--    (minutes depuis minuit), personnes la nuit, école, congés, heures, et
--    les journées imposées au calcul par durée de contrat (`journees_contrats`,
--    contrôlée par `private.planning_journees_ok`).
-- 2. planning_modeles_contrat (une ligne par type de contrat, mêmes valeurs
--    que le check de planning_salaries) : ce qui dépend du TYPE de contrat.
--    Lignes insérées ici avec le comportement actuel :
--      extra     : placé à la main seulement, heures indicatives, ni journées
--                  imposées ni journée étoile, aucun jour férié ;
--      stagiaire : jours fériés pris le jour même, pas de rattrapage,
--                  alternance (école) ;
--      apprenti  : rattrapage après un an, alternance ;
--      cdi, cdd  : rattrapage après un an.
--    Lecture rang >= 1, écriture rang >= 3 (gestion), comme les autres tables
--    de paramétrage (qui n'ont pas de journal `log_row_change` : celle-ci non
--    plus).
-- 3. Pour la page Besoins refaite (étape 7, D4, D8, D9, D11) :
--    planning_postes.importance, rempli ici d'après cette règle, dans cet
--    ordre (la première qui s'applique) :
--      a. 'indispensable' : poste de l'accueil le jour (`presence`) ou la
--         nuit (`accueil_nuit`), ou catégorie Veille de nuit ;
--      b. 'si_possible'   : catégorie Administratif hors site, poste sans
--         aucune ligne de besoin, ou poste tenu SEULEMENT par des cadres au
--         forfait jours (tous ses titulaires actifs, soutiens exclus : la
--         Direction, « si elle n'est pas là, elle n'est pas là », la règle
--         `sansSonCadre` du moteur ; D11 : Direction = Si possible) ;
--      c. 'important'     : tout le reste (défaut d'un poste créé ensuite).
--    planning_postes.fermeture (HH:MM, null : aucune ; rien n'est écrit) ;
--    planning_besoins.obligatoire (vrai : comportement actuel) et
--    planning_besoins.niveau_min ('depannage' : un dépannage suffit, comme
--    aujourd'hui).
-- 4. planning_semaine_type_ok : inchangée (D6, le jour étoile existe déjà).
--
-- Données écrites : la ligne de réglages reçoit ses défauts (colonnes
-- ajoutées), les 5 modèles de contrat, l'importance des postes existants
-- (livraison : `--avec-donnees`).

-- ------------------------------------------------------- journées imposées
-- Liste de { minutes_hebdo, durees[], courtes_max } : au plus 10 contrats,
-- une durée hebdomadaire de 1 h à 48 h (la loi), 1 à 4 durées de journée de
-- 1 h à 12 h, au plus 5 journées courtes ; deux entrées n'ont jamais la même
-- durée hebdomadaire.
create or replace function private.planning_journees_ok(p jsonb) returns boolean
  language plpgsql immutable
  set search_path to ''
as $$
declare
  e jsonb;
  d jsonb;
  vus integer[] := '{}';
  m integer;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 then
    return false;
  end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e -> 'minutes_hebdo') is distinct from 'number'
       or jsonb_typeof(e -> 'courtes_max') is distinct from 'number'
       or jsonb_typeof(e -> 'durees') is distinct from 'array' then
      return false;
    end if;
    if (e ->> 'minutes_hebdo')::numeric <> trunc((e ->> 'minutes_hebdo')::numeric)
       or (e ->> 'courtes_max')::numeric <> trunc((e ->> 'courtes_max')::numeric) then
      return false;
    end if;
    m := (e ->> 'minutes_hebdo')::integer;
    if m not between 60 and 2880 or (e ->> 'courtes_max')::integer not between 0 and 5
       or m = any (vus)
       or jsonb_array_length(e -> 'durees') not between 1 and 4 then
      return false;
    end if;
    vus := vus || m;
    for d in select * from jsonb_array_elements(e -> 'durees') loop
      if jsonb_typeof(d) <> 'number' or (d #>> '{}')::numeric <> trunc((d #>> '{}')::numeric)
         or (d #>> '{}')::integer not between 60 and 720 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;
revoke all on function private.planning_journees_ok(jsonb) from public;
grant execute on function private.planning_journees_ok(jsonb) to authenticated, service_role;

-- ------------------------------------------------- 1. règles globales
alter table public.planning_reglages
  -- Repos et rythme
  add column deux_repos_de_suite text not null default 'obligatoire'
    check (deux_repos_de_suite in ('obligatoire', 'souhaite', 'aucune')),
  -- La loi : 6 jours au plus (R-SIX-JOURS-MAX).
  add column jours_affiles_max smallint not null default 6
    check (jours_affiles_max between 1 and 6),
  add column jours_affiles_conseilles smallint not null default 5
    check (jours_affiles_conseilles between 1 and 6),
  add column jour_isole text not null default 'interdit'
    check (jour_isole in ('interdit', 'a_eviter', 'aucune')),
  -- Contrat (minutes par semaine) à partir duquel le rythme humain s'applique.
  add column rythme_contrat_min integer not null default 2100
    check (rythme_contrat_min between 0 and 2880),
  -- Repos conseillé entre deux services : jamais sous les 11 h de la loi.
  add column repos_confort integer not null default 720
    check (repos_confort between 660 and 1440),
  add column changements_moment_max smallint not null default 1
    check (changements_moment_max between 0 and 6),
  add column moment_arriere_jours smallint not null default 2
    check (moment_arriere_jours between 0 and 6),
  add column nuits_affilees_max smallint not null default 5
    check (nuits_affilees_max between 1 and 6),
  add column repos_apres_nuits smallint not null default 2
    check (repos_apres_nuits between 0 and 3),
  -- Passations (D8 : continuité obligatoire = choix ; faux = aujourd'hui)
  add column continuite_obligatoire boolean not null default false,
  add column passation_veilleur boolean not null default true,
  add column equipe_tolerance integer not null default 30
    check (equipe_tolerance between 0 and 240),
  add column duree_ouverture integer not null default 60
    check (duree_ouverture between 15 and 240),
  -- Limites des moments (minutes depuis minuit, `momentPropose`)
  add column nuit_debut integer not null default 1260 check (nuit_debut between 0 and 1439),
  add column nuit_fin integer not null default 300 check (nuit_fin between 0 and 1439),
  add column soir_fin integer not null default 1260 check (soir_fin between 0 and 1440),
  add column soir_debut integer not null default 900 check (soir_debut between 0 and 1439),
  add column matin_debut_avant integer not null default 540
    check (matin_debut_avant between 0 and 1439),
  add column matin_fin_max integer not null default 1065 check (matin_fin_max between 0 and 1440),
  add column libre_matin_avant integer not null default 750
    check (libre_matin_avant between 0 and 1439),
  -- Accueil : personnes la nuit au calcul (un deuxième se pose à la main).
  add column personnes_nuit smallint not null default 1 check (personnes_nuit between 0 and 5),
  -- École : pas de fin après la veille, pas de début avant le lendemain.
  add column ecole_veille_fin integer not null default 1260
    check (ecole_veille_fin between 0 and 1440),
  add column ecole_lendemain_debut integer not null default 480
    check (ecole_lendemain_debut between 0 and 1439),
  -- Congés : jours décomptés d'affilée qui ouvrent un retour en douceur.
  add column conge_long smallint not null default 5 check (conge_long between 1 and 30),
  -- Heures : semaines au-delà du contrat (sur 4) avant l'alerte.
  add column semaines_en_plus_alerte smallint not null default 3
    check (semaines_en_plus_alerte between 1 and 4),
  -- Contrats : journées imposées au calcul (35 h = 7 h ; 39 h = 8 h et une
  -- de 7 h) et les journées pleine, courte, étoile.
  add column journees_contrats jsonb not null default
    '[{"minutes_hebdo":2100,"durees":[420],"courtes_max":0},{"minutes_hebdo":2340,"durees":[480,420],"courtes_max":1}]'
    check (private.planning_journees_ok(journees_contrats)),
  add column journee_pleine integer not null default 480 check (journee_pleine between 360 and 720),
  add column journee_courte integer not null default 420 check (journee_courte between 60 and 720),
  add column journee_etoile_min integer not null default 420
    check (journee_etoile_min between 60 and 720),
  add column journees_courtes_max smallint not null default 1
    check (journees_courtes_max between 0 and 5);

alter table public.planning_reglages
  add constraint planning_reglages_jours_affiles
    check (jours_affiles_conseilles <= jours_affiles_max),
  add constraint planning_reglages_journees
    check (journee_courte <= journee_pleine and journee_etoile_min <= journee_pleine);

comment on column public.planning_reglages.deux_repos_de_suite is
  'Deux jours de repos de suite dans la semaine : obligatoire, souhaité ou aucune règle (mineurs : la loi).';
comment on column public.planning_reglages.continuite_obligatoire is
  'Aucun trou entre la fin d''une équipe et le début de la suivante : obligation (D8) ; faux = forte préférence.';
comment on column public.planning_reglages.personnes_nuit is
  'Personnes la nuit au calcul (plafond) ; un deuxième veilleur se pose à la main.';
comment on column public.planning_reglages.journees_contrats is
  'Journées imposées au calcul par durée de contrat : [{minutes_hebdo, durees[], courtes_max}].';

-- ------------------------------------------- 2. modèles de contrat
create table public.planning_modeles_contrat (
  type_contrat text primary key
    check (type_contrat in ('cdi', 'cdd', 'extra', 'stagiaire', 'apprenti')),
  -- Le calcul ne pose que les journées de `journees_contrats`.
  journees_imposees boolean not null default true,
  -- Au-delà de 35 h, une journée étoile chaque semaine.
  journee_etoile boolean not null default true,
  -- Jamais placé par le calcul (à appeler, posé à la main).
  placement_manuel boolean not null default false,
  -- Heures du contrat indicatives (aucune heure due).
  contrat_indicatif boolean not null default false,
  -- Un jour férié travaillé ouvre un jour férié rattrapé, après un an.
  ferie_rattrape boolean not null default true,
  -- Jours fériés pris le jour même.
  feries_jour_meme boolean not null default false,
  -- Alternance (école, CFA).
  alternance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_modeles_contrat_ferie check (not (ferie_rattrape and feries_jour_meme))
);

comment on table public.planning_modeles_contrat is
  'Règles de l''établissement propres à un type de contrat (une ligne par type).';

create trigger planning_modeles_contrat_stamp before insert or update
  on public.planning_modeles_contrat
  for each row execute function private.planning_stamp();

alter table public.planning_modeles_contrat enable row level security;

create policy "planning_modeles_contrat read (page:planning)" on public.planning_modeles_contrat
  for select to authenticated using ((select private.planning_niveau()) >= 1);
create policy "planning_modeles_contrat insert (page:planning)" on public.planning_modeles_contrat
  for insert to authenticated with check ((select private.planning_niveau()) >= 3);
create policy "planning_modeles_contrat update (page:planning)" on public.planning_modeles_contrat
  for update to authenticated using ((select private.planning_niveau()) >= 3)
  with check ((select private.planning_niveau()) >= 3);
create policy "planning_modeles_contrat delete (page:planning)" on public.planning_modeles_contrat
  for delete to authenticated using ((select private.planning_niveau()) >= 3);

grant select, insert, update, delete on public.planning_modeles_contrat to authenticated;
grant all on public.planning_modeles_contrat to service_role;

insert into public.planning_modeles_contrat
  (type_contrat, journees_imposees, journee_etoile, placement_manuel, contrat_indicatif,
   ferie_rattrape, feries_jour_meme, alternance)
values
  ('cdi',       true,  true,  false, false, true,  false, false),
  ('cdd',       true,  true,  false, false, true,  false, false),
  ('extra',     false, false, true,  true,  false, false, false),
  ('stagiaire', true,  true,  false, false, false, true,  true),
  ('apprenti',  true,  true,  false, false, true,  false, true);

-- ---------------------------------------- 3. importance, fermeture, besoins
alter table public.planning_postes
  add column importance text not null default 'important'
    check (importance in ('indispensable', 'important', 'si_possible')),
  add column fermeture text
    check (fermeture is null or fermeture ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

comment on column public.planning_postes.importance is
  'Importance du poste quand il manque du monde : indispensable, important, si possible (reste vide en premier).';
comment on column public.planning_postes.fermeture is
  'Heure jusqu''à laquelle ce poste doit être tenu chaque soir (null : aucune).';

update public.planning_postes p
   set importance = case
     when p.presence or p.accueil_nuit or p.categorie = 'veille_nuit' then 'indispensable'
     when p.categorie = 'administratif_hors_site'
       or not exists (select 1 from public.planning_besoins b where b.poste_id = p.id)
       or (exists (select 1 from public.planning_salaries s
                    where s.actif and exists (
                      select 1 from jsonb_array_elements(s.competences) c
                       where (c ->> 'poste_id')::bigint = p.id and c ->> 'niveau' <> 'soutien'))
           and not exists (select 1 from public.planning_salaries s
                            where s.actif and not s.forfait_jours and exists (
                              select 1 from jsonb_array_elements(s.competences) c
                               where (c ->> 'poste_id')::bigint = p.id and c ->> 'niveau' <> 'soutien')))
       then 'si_possible'
     else 'important'
   end;

alter table public.planning_besoins
  add column obligatoire boolean not null default true,
  add column niveau_min text not null default 'depannage'
    check (niveau_min in ('titulaire', 'depannage'));

comment on column public.planning_besoins.obligatoire is
  'Besoin obligatoire (vrai) ou souhaité : un souhaité reste vide avant un obligatoire.';
comment on column public.planning_besoins.niveau_min is
  'Niveau demandé : titulaire exigé, ou dépannage accepté.';
