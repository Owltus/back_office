-- =============================================================================
-- Parking — détail complet des 2 lignes DHEILLY en doublon (lecture seule).
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- Sert à décider laquelle des deux lignes garder avant toute suppression.
-- =============================================================================
select *
from public.parking_reservations
where id in (
  '7fb59341-4580-4caf-af29-3d1d7ebc65f0',
  'a8bcf118-21c3-46a2-9823-e707604cfae4'
)
order by created_at;
