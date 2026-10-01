-- Effacement du code de la boîte à clés de la chaufferie dans les points de
-- restauration du classeur 5 « Procédures de la réception » (2026-10-01).
--
-- Contexte : le code a été retiré du document 89 et de ses anciennes
--   versions (`classeur_doc89_purge_code_2026-10-01.sql`) ; il restait dans
--   11 points de restauration sur 15 (copies complètes du classeur).
-- Décision : choix explicite de l'utilisateur le 2026-10-01 — « effacer le
--   code dedans » plutôt que supprimer les sauvegardes, qui restent
--   utilisables pour tout le reste.
-- Portée : `classeur_merge_history`, classeur 5 seulement ; deux formulations
--   EXACTES remplacées par « code (retiré) » : « code **4400** » (11 points,
--   id 14 à 24) et « code 4400 » (point 14) — 12 remplacements, aucun autre
--   nombre touché.
-- Innocuité : transaction ; il ne doit plus rester une seule occurrence et
--   exactement 11 lignes doivent changer, sinon tout est annulé.

begin;

do $$
declare
  n integer;
  reste integer;
begin
  update public.classeur_merge_history
     set snapshot = replace(
           replace(snapshot::text, 'code **4400**', 'code (retiré)'),
           'code 4400', 'code (retiré)'
         )::jsonb
   where classeur_id = 5
     and snapshot::text like '%4400%';
  get diagnostics n = row_count;
  select count(*) into reste
    from public.classeur_merge_history
   where classeur_id = 5 and snapshot::text like '%4400%';
  if n <> 11 or reste <> 0 then
    raise exception 'Attendu 11 points modifiés et 0 restant, obtenu % et % : rien n''est fait.', n, reste;
  end if;
end
$$;

commit;
