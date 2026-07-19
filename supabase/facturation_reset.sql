-- =============================================================================
-- facturation_reset — REMET À ZÉRO tout l'apprentissage de la facturation.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Vide UNIQUEMENT les tables NOUVELLES de la facturation (non partagées) : nuages de mots,
-- dictionnaire d'émetteurs, co-occurrence émetteur→codes, denylist. Ne touche à AUCUNE table
-- partagée (profiles, daily_reports, forecast_days, budget, email_recipients, hotel_config,
-- audit_log) ni à auth.users. Les tables et les RPC restent en place : seules les DONNÉES
-- apprises sont effacées → on repart d'une base neuve, prête à réapprendre au tamponnage.
--
-- ⚠ IRRÉVERSIBLE : tout le vocabulaire et tous les liens appris sont perdus.
-- =============================================================================

do $$
begin
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
end
$$;
