-- Audit RH du planning, décisions de l'utilisateur du 2026-11-01
-- (plan/planning-audit-rh-2026-11-01/00-AUDIT.md, U1, U3, U10).
--
-- U1  Un seul choix « Accueil : non / matin et soir / nuit » par poste. Le
--     matin et le soir restent `presence` ; la nuit devient `accueil_nuit`,
--     au lieu de dépendre en silence de la catégorie HCR « veille_nuit »
--     (qui garde son seul rôle : la durée maximale d'un service).
-- U3  Un poste peut être FERMÉ : plus proposé nulle part, ses shifts passés
--     restent dans l'historique.
-- U10 Ménage (« on est en dev, rien n'est perdu ») : `a_part` retiré (le
--     rangement de la fiche se déduit de l'accueil), anciens besoins des
--     postes de l'accueil effacés (ignorés depuis D13), une place d'apprenti
--     n'est plus mise par défaut, un horaire a toujours un moment, et
--     l'import du prototype (`planning_importer`) est retiré : la prod est
--     la référence du planning depuis le 2026-10-27.

alter table public.planning_postes
  add column accueil_nuit boolean not null default false,
  add column ferme boolean not null default false;

update public.planning_postes set accueil_nuit = true
where categorie = 'veille_nuit';

alter table public.planning_postes
  add constraint planning_postes_accueil_un_moment
  check (not (presence and accueil_nuit));

comment on column public.planning_postes.presence is
  'Poste de l''accueil le matin et le soir (tableau Accueil de la page Besoins).';
comment on column public.planning_postes.accueil_nuit is
  'Poste de l''accueil la nuit (ligne Nuit du tableau Accueil).';
comment on column public.planning_postes.ferme is
  'Poste fermé : plus proposé dans les fiches, les menus ni les besoins ; historique gardé.';

alter table public.planning_postes drop column a_part;

delete from public.planning_besoins b
using public.planning_postes p
where p.id = b.poste_id and (p.presence or p.accueil_nuit);

alter table public.planning_besoins alter column soutien set default 0;

alter table public.planning_horaires alter column periode set not null;

drop function if exists public.planning_importer(jsonb);
