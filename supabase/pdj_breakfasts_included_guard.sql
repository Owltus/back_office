-- =============================================================================
-- pdj_breakfasts — GARDE-FOU serveur de `breakfasts_included` (nombre de cases)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- BUT : rendre la règle « cases attendues » AUTORITAIRE EN BASE, insensible à la
-- source d'écriture (Edge auto périmée, client, réimport…). Sur toute écriture
-- d'une ligne D'IMPORT (`manual_kind IS NULL`), `breakfasts_included` est
-- RECALCULÉ depuis les colonnes source de la LIGNE elle-même :
--    cases = min( N PAX si le tarif le précise sinon adultes, occupants, 2 )
--    → le PAX du tarif = nb de PDJ VENDUS, BORNÉ au nb d'occupants réels
--      (adultes + enfants) : « 2 PAX » avec 1 adulte + 1 enfant -> 2 (enfant payant
--      compté), mais « 2 PAX » pour une personne SEULE -> 1 (pas de couvert
--      fantôme) ; sans PAX, les adultes seuls ; JAMAIS plus de 2 ; 0 si pas de PDJ.
-- Règle STRICTEMENT IDENTIQUE à src/lib/pdj/csv.ts, supabase/functions/
-- import-report/pdj.ts et supabase/pdj_breakfasts_recompute.sql (même regex,
-- même least()). Donc pour un import déjà correct : aucun changement (idempotent).
--
-- Les lignes MANUELLES (`manual_kind` = 'inclus' | 'extra' : day-use / no-show)
-- sont LAISSÉES INTACTES — leur `breakfasts_included` est posé exprès par la
-- saisie et ne doit jamais être écrasé.
--
-- NON DESTRUCTEUR : trigger BEFORE, ne touche qu'une colonne DÉRIVÉE à partir des
-- colonnes source de la même ligne, jamais une autre ligne. Idempotent (rejouable).
-- Ne corrige PAS le passé à lui seul : il agit sur les écritures À VENIR. Pour les
-- jours déjà en base sous l'ancienne règle, lancer une fois l'ÉTAPE 2 de
-- supabase/pdj_breakfasts_recompute.sql (ou ré-importer les jours concernés).
-- =============================================================================

create or replace function public.pdj_clamp_breakfasts_included()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  -- Ligne manuelle (day-use / no-show) : valeur voulue par la saisie → on n'y touche pas.
  if new.manual_kind is not null then
    return new;
  end if;

  -- Ligne d'import : la règle fait foi, on recalcule depuis addons / rate_plan / adults.
  new.breakfasts_included := case
    when upper(coalesce(new.addons, '')) like '%PDJ%' then
      least(
        coalesce(
          (regexp_match(upper(coalesce(new.rate_plan, '')), '([0-9]+)[[:space:]]*PAX'))[1]::int,
          new.adults
        ),
        coalesce(new.adults, 0) + coalesce(new.children, 0),
        2
      )
    else 0
  end;

  return new;
end;
$$;

drop trigger if exists pdj_breakfasts_clamp_included on public.pdj_breakfasts;

create trigger pdj_breakfasts_clamp_included
  before insert or update on public.pdj_breakfasts
  for each row
  execute function public.pdj_clamp_breakfasts_included();
