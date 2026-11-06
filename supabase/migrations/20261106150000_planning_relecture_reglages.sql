-- Relecture adverse des lots 1a à 2b du chantier « moteur configurable »
-- (2026-11-06). Ajouts seulement : rien n'est retiré, aucun contenu écrit.
--
-- 1. Un moment qui a des chiffres au tableau ne sort pas du tableau (PL409) :
--    ses places devenaient impossibles et sa ligne invisible.
-- 2. Les jours du week-end se suivent dans la semaine civile (lundi 0 à
--    dimanche 6) : `{6,0}` (dimanche et lundi) était mal compris.
-- 3. L'article du nom d'un moment (« le », « la », « l' »), facultatif :
--    sans lui, l'app garde l'ancienne règle (la nuit, le reste). Les moments
--    de l'hôtel ne changent pas de phrase.

create or replace function private.planning_moments_tableau() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.compte_dans_tableau and not new.compte_dans_tableau
     and exists (select 1 from public.planning_consignes c
                  where c.periode = old.id
                    and (c.minimum > 0 or coalesce(c.maximum, 0) > 0)) then
    raise exception 'Ce moment a des chiffres au tableau : mettez-les à 0 avant de le sortir du tableau.'
      using errcode = 'PL409';
  end if;
  return new;
end $$;
revoke all on function private.planning_moments_tableau() from public, anon, authenticated;
create trigger planning_moments_tableau
  before update of compte_dans_tableau on public.planning_moments
  for each row execute function private.planning_moments_tableau();

-- Rangés et consécutifs : le dernier moins le premier vaut le nombre de
-- jours moins un, et pour trois jours celui du milieu suit le premier.
alter table public.planning_reglages
  add constraint planning_reglages_weekend_consecutifs check (
    weekend_jours[cardinality(weekend_jours)] - weekend_jours[1]
      = cardinality(weekend_jours) - 1
    and (cardinality(weekend_jours) < 3
         or weekend_jours[2] = weekend_jours[1] + 1));

alter table public.planning_moments
  add column article text check (article in ('le', 'la', 'l'''));
comment on column public.planning_moments.article is
  'Article du nom dans une phrase (« le », « la », « l'' ») ; vide : la nuit, le reste.';
