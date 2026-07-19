-- =============================================================================
-- facturation_reset_DANGER — ⚠⚠ EFFACE TOUT L'APPRENTISSAGE de la facturation ⚠⚠
--
-- NE PAS LANCER PAR REFLEXE. Ceci n'est PAS l'outil de correction du quotidien.
--
-- AVANT d'utiliser ce script, préférer les corrections CIBLÉES (aucune perte massive) :
--   • Modal « Contrôle des imputations » (engrenage à côté de l'émetteur) :
--       - « Désapprendre » une association émetteur→code posée par erreur,
--       - « Réinitialiser » le vocabulaire d'UN code pollué,
--       - « Lever l'interdiction » d'un couple banni par erreur.
--   • « Annuler l'apprentissage » sur une facture de la séance.
-- Ces outils réparent une erreur SANS jeter l'apprentissage de toute l'équipe.
--
-- Ce script `truncate` les 5 tables facturation (wordpool, issuers, issuer_codes,
-- denylist, learned_docs). IRRÉVERSIBLE. Tout ce que l'équipe a appris est perdu (précédent
-- réel : rapro_rooms vidée en prod = données perdues). Ne touche à AUCUNE table partagée.
--
-- GARDE-FOU : le reset est BLOQUÉ tant qu'un jeton de confirmation n'est pas posé dans
-- la MÊME session SQL. Pour confirmer, exécute d'abord CETTE ligne, seule, puis ce script :
--     set facturation.confirm_reset = 'OUI_EFFACER_TOUT';
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
-- =============================================================================

do $$
begin
  -- Garde : sans le jeton exact pose dans la session, on refuse et on explique.
  if current_setting('facturation.confirm_reset', true) is distinct from 'OUI_EFFACER_TOUT' then
    raise exception
      'Reset BLOQUE. Ceci efface TOUT l''apprentissage. Prefere le modal « Controle des imputations » pour une correction ciblee. Pour forcer le reset total, execute d''abord dans CETTE session : set facturation.confirm_reset = ''OUI_EFFACER_TOUT'';';
  end if;

  if to_regclass('public.facturation_wordpool') is not null then
    truncate table public.facturation_wordpool;
  end if;
  if to_regclass('public.facturation_issuers') is not null then
    truncate table public.facturation_issuers;
  end if;
  if to_regclass('public.facturation_issuer_codes') is not null then
    truncate table public.facturation_issuer_codes;
  end if;
  if to_regclass('public.facturation_issuer_denylist') is not null then
    truncate table public.facturation_issuer_denylist;
  end if;
  if to_regclass('public.facturation_learned_docs') is not null then
    truncate table public.facturation_learned_docs;
  end if;

  -- Consommer le jeton : un second lancement redemandera une confirmation explicite.
  perform set_config('facturation.confirm_reset', '', false);
end
$$;
