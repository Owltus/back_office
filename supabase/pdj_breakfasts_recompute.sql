-- =============================================================================
-- pdj_breakfasts — RECALCUL rétroactif de `breakfasts_included`
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, EN DEUX TEMPS :
--   ÉTAPE 1 = aperçu (lecture seule, n'écrit RIEN) → on regarde ce qui changerait.
--   ÉTAPE 2 = application (l'UPDATE) → seulement si l'aperçu est cohérent.
-- Dans l'éditeur SQL, sélectionne le bloc voulu puis « Run ».
--
-- Contexte : `breakfasts_included` est calculé À L'IMPORT puis figé en base. La
-- règle a changé (voir csv.ts / import-report/pdj.ts) :
--   cases = min( N PAX si le tarif le précise sinon adultes, occupants, 2 )
--   → le PAX du tarif = nb de PDJ VENDUS, BORNÉ au nb d'occupants réels
--     (adultes + enfants) : « 2 PAX » avec 1 adulte + 1 enfant -> 2 (enfant payant
--     compté), mais « 2 PAX » pour une personne SEULE -> 1 (pas de couvert
--     fantôme) ; sans PAX, les adultes seuls ; JAMAIS plus de 2.
-- On réapplique EXACTEMENT cette règle aux lignes DÉJÀ importées, à partir des
-- colonnes stockées (`rate_plan` = libellé « Rate », `adults`, `addons`).
--
-- NON DESTRUCTEUR : une seule colonne DÉRIVÉE recalculée depuis des colonnes
-- source (jamais modifiées). Idempotent (rejouable). Ne touche QUE les lignes qui
-- changent. Regex SQL `([0-9]+)[[:space:]]*PAX` = équivalent du JS `/(\d+)\s*PAX/`.
-- =============================================================================


-- ========================= ÉTAPE 1 — APERÇU (lecture seule) ===================
-- N'écrit RIEN. Liste les lignes qui seraient modifiées, avec avant → après.
-- Si rien ne s'affiche : tout est déjà correct, l'étape 2 est inutile.
select
  b.service_date,
  b.room,
  b.adults,
  b.children,
  b.rate_plan,
  b.breakfasts_included as avant,
  least(
    coalesce(
      (regexp_match(upper(coalesce(b.rate_plan, '')), '([0-9]+)[[:space:]]*PAX'))[1]::int,
      b.adults
    ),
    coalesce(b.adults, 0) + coalesce(b.children, 0),
    2
  ) as apres
from public.pdj_breakfasts b
where upper(coalesce(b.addons, '')) like '%PDJ%'
  and b.breakfasts_included is distinct from least(
        coalesce(
          (regexp_match(upper(coalesce(b.rate_plan, '')), '([0-9]+)[[:space:]]*PAX'))[1]::int,
          b.adults
        ),
        coalesce(b.adults, 0) + coalesce(b.children, 0),
        2
      )
order by b.service_date desc, b.room;


-- ========================= ÉTAPE 2 — APPLICATION (UPDATE) =====================
-- À lancer SEULEMENT après avoir validé l'aperçu ci-dessus.
with recomputed as (
  select
    id,
    case
      when upper(coalesce(addons, '')) like '%PDJ%' then
        least(
          coalesce(
            (regexp_match(upper(coalesce(rate_plan, '')), '([0-9]+)[[:space:]]*PAX'))[1]::int,
            adults
          ),
          coalesce(adults, 0) + coalesce(children, 0),
          2
        )
      else 0
    end as new_val
  from public.pdj_breakfasts
)
update public.pdj_breakfasts b
set breakfasts_included = r.new_val
from recomputed r
where b.id = r.id
  and b.breakfasts_included is distinct from r.new_val;
