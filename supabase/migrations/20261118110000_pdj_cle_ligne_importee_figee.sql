-- =====================================================================
-- PDJ : la clé d'une ligne importée est figée hors gestion
-- (audit de sécurité run-2 du 2026-11-18, étape 1 du plan
-- `plan/securite-audit-run2-2026-11-18/`)
-- =====================================================================
-- Symptôme : un compte PDJ en écriture (rang 2) déplace une ligne IMPORTÉE
--   vers une autre chambre (ou une autre date), ce qui libère la place
--   (service_date, room). Il y insère ensuite une ligne manuelle « inclus »
--   avec autant de petits-déjeuners qu'il veut. Le gel du 2026-10-17
--   (« une ligne importée ne devient pas manuelle ») et le plafond de 2
--   sont ainsi contournés.
-- Cause : `pdj_breakfasts_manual_kind_fige` ne protège que la colonne
--   `manual_kind`. La policy UPDATE ne borne que la date : `room` et
--   `service_date` restent modifiables.
-- Correctif : hors gestion et hors contexte système, une ligne importée
--   (`old.manual_kind is null`) garde sa chambre et sa date. Les comparer
--   avec `is distinct from` ; sinon 42501.
-- Innocuité : l'app ne déplace jamais la chambre d'une ligne. L'upsert du
--   client sur `service_date,room` renvoie les mêmes valeurs de clé : il
--   passe. L'import nocturne (clé serveur, auth.uid() nul) et la gestion ne
--   sont pas concernés. Une ligne manuelle reste déplaçable comme avant.
--   Aucune donnée réécrite. Dernière définition : 20261017110000.
-- =====================================================================

create or replace function public.pdj_breakfasts_manual_kind_fige()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Contexte non-utilisateur (import nocturne, maintenance) : aucun garde-fou.
  if auth.uid() is null then
    return new;
  end if;
  -- La gestion (et l'admin, get_page_level = 'gestion') peut tout.
  if private.get_page_level('pdj') = 'gestion' then
    return new;
  end if;
  if old.manual_kind is null and new.manual_kind is not null then
    raise exception using
      errcode = '42501',
      message = 'pdj: une ligne importee ne devient pas manuelle (reserve a la gestion)';
  end if;
  -- 2026-11-18 : la ligne importée d'une chambre reste celle de cette
  -- chambre et de ce jour (sinon on la déplace, puis on la remplace).
  if old.manual_kind is null
     and (new.room is distinct from old.room
          or new.service_date is distinct from old.service_date) then
    raise exception using
      errcode = '42501',
      message = 'pdj: la chambre et la date d''une ligne importee sont figees (reserve a la gestion)';
  end if;
  return new;
end;
$$;

alter function public.pdj_breakfasts_manual_kind_fige() owner to postgres;
-- Fonction de trigger fermée à authenticated (relecture adverse du
-- 2026-11-18 : elle l'était par les privilèges par défaut).
revoke all on function public.pdj_breakfasts_manual_kind_fige() from public, anon, authenticated;
