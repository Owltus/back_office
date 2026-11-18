-- =====================================================================
-- RepJour : le marqueur d'envoi `auto_sent_at` appartient au serveur
-- (audit de sécurité run-2 du 2026-11-18, étape 1 du plan
-- `plan/securite-audit-run2-2026-11-18/`)
-- =====================================================================
-- Symptôme : un compte RepJour en écriture (rang 2) peut, par un appel
--   direct à l'API, effacer `daily_reports.auto_sent_at` du jour importé.
--   Cela rouvre la saisie manuelle du Forecast du mois (réservée à la
--   gestion une fois le rapport parti, `repjour_manual_forecast_allowed`).
--   Il peut aussi poser ce marqueur sur un jour pas encore envoyé : l'envoi
--   automatique croit alors le rapport parti et ne l'envoie pas.
-- Cause : les policies d'écriture de `daily_reports` ne regardent que le
--   rang de la page, et le seul trigger (`daily_reports_stamp`) n'estampille
--   que `imported_by`.
-- Correctif : pour un utilisateur de l'app (auth.uid() non nul), le trigger
--   garde `old.auto_sent_at` sur un UPDATE et force null sur un INSERT.
--   L'estampille `imported_by` reste telle quelle.
-- Innocuité : le marqueur n'est posé que par le serveur, avec la clé
--   secrète (auth.uid() nul) : `import-report/autoSend.ts`, `marker.ts` et
--   `send-report`. Le client n'envoie jamais `auto_sent_at` (l'upsert de
--   l'import manuel ne porte pas la colonne : la valeur en base reste).
--   Aucune donnée réécrite. Dernière définition : baseline.
-- =====================================================================

create or replace function public.daily_reports_stamp()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Utilisateur de l'app : l'auteur est TOUJOURS la session courante, et le
  -- marqueur d'envoi ne bouge pas (il appartient au serveur).
  -- Contexte système (Edge import-report, send-report, service_role) :
  -- valeurs laissées telles quelles.
  if auth.uid() is not null then
    new.imported_by := auth.uid();
    if tg_op = 'INSERT' then
      new.auto_sent_at := null;
    else
      new.auto_sent_at := old.auto_sent_at;
    end if;
  end if;
  return new;
end;
$$;
