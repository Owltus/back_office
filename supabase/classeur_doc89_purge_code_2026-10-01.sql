-- Purge des anciennes versions du document 89 qui contiennent le code de la
-- boîte à clés de la chaufferie (2026-10-01).
--
-- Symptôme : le code avait été retiré du document 89 (« Suivi sanitaire
--   hebdomadaire », classeur 5) le 2026-10-01, mais restait lisible dans
--   l'historique du document (bouton Historique).
-- Décision : SUPPRESSION demandée explicitement par l'utilisateur le
--   2026-10-01 (« oui supprime les anciennes versions »).
-- Portée : les SEULES lignes de `classeur_document_versions` du document 89
--   dont le texte contient « 4400 » — 14 lignes relevées (id 162 à 177). La
--   version courante (178) et l'état initial (161) n'ont pas le code et
--   restent. Les points de restauration du classeur ne sont PAS touchés ici.
-- Innocuité : transaction ; le nombre de lignes supprimées est vérifié, toute
--   autre valeur annule tout.
-- Vérification : `select count(*) from classeur_document_versions where
--   document_id = 89 and content like '%4400%'` doit rendre 0.

begin;

do $$
declare
  n integer;
begin
  delete from public.classeur_document_versions
   where document_id = 89
     and content like '%4400%';
  get diagnostics n = row_count;
  if n <> 14 then
    raise exception 'Attendu 14 versions supprimées, % trouvées : rien n''est fait.', n;
  end if;
end
$$;

commit;
