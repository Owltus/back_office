-- =============================================================================
-- Classeur : liste complète des périodicités de suivi (2026-10-30)
-- =============================================================================
-- Ajoute : quotidien, hebdomadaire, toutes les deux semaines, bimestriel,
-- trimestriel, quadrimestriel, décennal. Range toute la liste de la plus
-- fréquente à la plus rare, « Non défini » en dernier.
--
-- Ne casse rien :
--   - aucun libellé existant renommé ni supprimé (feuilles liées par id) ;
--   - le nombre de lignes des 9 existantes n'est pas touché ;
--   - rejouable : `on conflict do nothing`, mises à jour par libellé.
-- « nombre » = lignes du tableau Date | Note | Signature (1 page A4).
--
-- ⚠ Déjà joué À LA MAIN en prod (éditeur SQL) le 2026-10-30 par
-- l'utilisateur. Ce fichier réaligne le projet ; rejoué à la livraison, il ne
-- change rien en prod.
-- =============================================================================

-- 1) Nouvelles périodicités
insert into public.classeur_periodicites (label, nombre, sort_order) values
  ('Quotidien',      31,  10),  -- une feuille = un mois
  ('Hebdomadaire',   13,  20),  -- une feuille = un trimestre
  ('Bimensuel',      12,  30),  -- toutes les deux semaines ; une feuille = 6 mois
  ('Bimestriel',      8,  60),  -- tous les 2 mois
  ('Trimestriel',     8,  70),  -- tous les 3 mois
  ('Quadrimestriel',  8,  80),  -- tous les 4 mois
  ('Décennal',        4, 160)   -- tous les 10 ans
on conflict (label) do nothing;

-- 2) Ordre complet, de la plus fréquente à la plus rare
update public.classeur_periodicites p
set sort_order = o.sort_order
from (values
  ('Quotidien',       10), ('Hebdomadaire',    20), ('Bimensuel',       30),
  ('Mensuel',         40), ('Sesquimestriel',  50), ('Bimestriel',      60),
  ('Trimestriel',     70), ('Quadrimestriel',  80), ('Semestriel',      90),
  ('Annuel',         100), ('Biennale',       110), ('Triennal',       120),
  ('Quadriennal',    130), ('Quinquennal',    140), ('Décennal',       160),
  ('Non défini',     999)
) as o(label, sort_order)
where p.label = o.label
  and p.sort_order is distinct from o.sort_order;

-- 3) Garde-fou : même borne que l'import (1 à 60 lignes)
do $$
begin
  if exists (select 1 from public.classeur_periodicites
             where nombre not between 1 and 60) then
    raise exception 'Une périodicité a un nombre de lignes hors de 1..60.';
  end if;
end $$;

alter table public.classeur_periodicites
  drop constraint if exists classeur_periodicites_nombre_check;
alter table public.classeur_periodicites
  add constraint classeur_periodicites_nombre_check
  check (nombre between 1 and 60);

-- 4) Contrôle final : les 16 périodicités sont là. Sur une base rejouée
-- depuis zéro (dev, `db:reset`), les 9 de départ viennent du seed, joué
-- APRÈS les migrations : le contrôle n'a alors pas d'objet.
do $$
declare
  manquantes text;
begin
  if not exists (select 1 from public.classeur_periodicites
                 where label = 'Non défini') then
    return;
  end if;
  select string_agg(l, ', ') into manquantes
  from unnest(array[
    'Quotidien','Hebdomadaire','Bimensuel','Mensuel','Sesquimestriel',
    'Bimestriel','Trimestriel','Quadrimestriel','Semestriel','Annuel',
    'Biennale','Triennal','Quadriennal','Quinquennal','Décennal','Non défini'
  ]) as l
  where not exists (select 1 from public.classeur_periodicites p where p.label = l);
  if manquantes is not null then
    raise exception 'Périodicités manquantes : %', manquantes;
  end if;
end $$;
