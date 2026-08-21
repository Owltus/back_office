-- =============================================================================
-- caisse_cautions — suppression : ecriture autorisée LE JOUR MÊME de la prise
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Ne touche AUCUNE donnée : remplace uniquement la policy DELETE existante
-- (initialement gestion seule, voir supabase/caisse_cautions.sql).
--
-- POURQUOI
--   Réservée à `gestion` au départ, la suppression s'est révélée trop stricte à
--   l'usage : un rôle `ecriture` doit pouvoir corriger IMMÉDIATEMENT une erreur
--   de saisie (mauvaise chambre, mauvais montant) sans attendre un gestionnaire.
--   Mais une caution PLUS ANCIENNE peut déjà « courir » depuis plusieurs jours
--   (elle compte dans le fond de plusieurs feuilles, potentiellement déjà
--   clôturées) — la supprimer effacerait cet historique sans laisser de trace,
--   d'où la borne au jour de création (`taken_date = current_date`). Au-delà,
--   seule la gestion peut encore supprimer (elle assume la correction historique,
--   comme pour une feuille de caisse déjà clôturée).
-- =============================================================================

drop policy if exists "caisse cautions delete (page:caisse gestion)" on public.caisse_cautions;
drop policy if exists "caisse cautions delete (page:caisse)" on public.caisse_cautions;

create policy "caisse cautions delete (page:caisse)"
  on public.caisse_cautions for delete to authenticated
  using (
    public.get_page_level('caisse') = 'gestion'
    or (
      public.page_level_rank(public.get_page_level('caisse')) >= 2
      and taken_date = current_date
    )
  );

-- ---- Vérification (lecture seule) -------------------------------------------
-- select policyname, cmd, qual from pg_policies
-- where tablename = 'caisse_cautions' and cmd = 'DELETE';
