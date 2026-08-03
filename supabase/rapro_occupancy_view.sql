-- =============================================================================
-- RAPRO — vue d'occupation In-House SANS données nominatives
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Crée/replace une VUE en lecture seule ; ne touche aucune donnée, aucune table.
--
-- POURQUOI
--   Le rapprochement construit sa grille à partir du rooming In-House, stocké dans
--   `pdj_breakfasts` (page PDJ). Or cette table contient des données NOMINATIVES
--   (guest_name) et sa lecture est fermée à la seule page `pdj`. Un compte
--   `rapro:lecture` sans droit `pdj` lisait donc 0 ligne → « grille de secours »
--   à tort. Cette vue expose UNIQUEMENT ce dont le rapprochement a besoin
--   (service_date, room, adr) — jamais le nom du client — et se garde elle-même
--   sur la page `rapro`.
--
-- MÉCANIQUE
--   La vue tourne avec les privilèges de son PROPRIÉTAIRE (postgres via le SQL
--   editor), qui contourne la RLS de `pdj_breakfasts` : c'est voulu, la vue
--   n'expose pas de PII. Le contrôle d'accès est porté par le WHERE, qui gate sur
--   le niveau `rapro` du CALLER (get_page_level lit le JWT de l'appelant, même
--   quand la vue tourne en propriétaire). `adr` sert au calcul des chambres
--   offertes (tarif 0) côté rapprochement ; ce n'est pas une donnée personnelle.
-- =============================================================================

create or replace view public.rapro_occupancy as
  select b.service_date, b.room, b.adr
  from public.pdj_breakfasts b
  where (select public.page_level_rank(public.get_page_level('rapro'))) >= 1;

-- La vue n'est PAS en security_invoker : elle s'exécute avec les droits du
-- propriétaire (bypass RLS pdj), l'accès étant borné par le WHERE ci-dessus.
-- On restreint quand même les grants au strict nécessaire.
revoke all on public.rapro_occupancy from anon;
grant select on public.rapro_occupancy to authenticated;


-- VÉRIFICATION — la vue existe et n'expose pas guest_name.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'rapro_occupancy'
order by ordinal_position;
