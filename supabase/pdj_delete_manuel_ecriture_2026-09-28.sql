-- =============================================================================
-- pdj_delete_manuel_ecriture_2026-09-28 — un compte ÉCRITURE peut retirer
-- une saisie manuelle PDJ (day-use, no-show revenu…) dans la fenêtre J-3 —
-- la SIENNE comme celle d'un collègue, exactement comme il peut déjà les
-- créer et les modifier (insert et update ouverts sur la même fenêtre)
--
-- ⚠ NON APPLIQUÉ. À jouer par l'utilisateur :
--   `supabase db query --linked -f supabase/pdj_delete_manuel_ecriture_2026-09-28.sql`
--   (ou coller dans le SQL Editor). Idempotent : `drop policy if exists` +
--   `create policy`, dans UNE transaction (en cas d'erreur, rien ne change).
--
-- SYMPTÔME
--   Sur /pdj, un compte au niveau « écriture » coche une case d'une chambre non
--   check-in (saisie manuelle), puis la décoche entièrement : la case se vide
--   à l'écran, puis la saisie REVIENT au rechargement. Jusqu'au 2026-09-28,
--   aucun message : la suppression échouait en silence.
--
-- CAUSE
--   Tout décocher appelle `setManualServe(…, 0, …)`, qui SUPPRIME la ligne
--   manuelle (`delete … where manual_kind is not null`). Or la policy DELETE
--   de `pdj_breakfasts` est réservée à la gestion (« DELETE (jour entier) =
--   gestion », pdj_rls_fenetre_3j.sql). Pour un compte écriture, la RLS filtre
--   la ligne : le DELETE touche 0 ligne SANS erreur. Depuis le 2026-09-28,
--   l'application lit les lignes supprimées (`.select('id')`) et affiche
--   « Suppression refusée : droit insuffisant. » — le défaut est visible,
--   mais la saisie reste impossible à retirer tant que ce script n'est pas joué.
--
-- CORRECTIF
--   La policy DELETE « pdj delete (page:pdj) » devient :
--     gestion
--     OU (rang écriture ET ligne MANUELLE ET service_date >= current_date - 3)
--   Même fenêtre J-3 que l'insert et l'update de la même table ; même
--   écriture que les policies de perf_rls_ecriture_2026-09-05.sql (aides
--   `private.*` enveloppées en `(select …)`, évaluées une fois par
--   instruction).
--
-- INNOCUITÉ
--   - Aucune table, aucune donnée, aucun trigger, aucune autre policy.
--   - La gestion garde exactement son droit (tout supprimer, tout jour).
--   - Un compte écriture ne peut supprimer QUE des lignes `manual_kind is not
--     null` : les lignes d'IMPORT (manual_kind null, In-House du PMS) restent
--     hors de sa portée, et la suppression d'un JOUR entier (`deleteDay`)
--     reste réservée à la gestion (elle échoue sur les lignes d'import).
--   - Ce qu'un compte écriture peut supprimer, il pouvait déjà le créer et le
--     modifier (insert/update ouverts sur la même fenêtre J-3) : aucune
--     capacité nouvelle sur des données qui ne lui sont pas déjà ouvertes.
--   - Rang lecture ou sans droit : inchangé (0 ligne).
--
-- ⚠ ANTI « REVERT SILENCIEUX » : pdj_rls_fenetre_3j.sql, page_permissions_rls.sql
--   et perf_rls_ecriture_2026-09-05.sql recréent encore l'ANCIENNE policy
--   (gestion seule). Rejouer l'un d'eux APRÈS ce script annulerait ce
--   correctif sans bruit : rejouer ensuite ce script.
-- =============================================================================

begin;

-- pdj_breakfasts / DELETE
drop policy if exists "pdj delete (page:pdj)" on public.pdj_breakfasts;
create policy "pdj delete (page:pdj)" on public.pdj_breakfasts
  for delete to authenticated
  using ((((select private.get_page_level('pdj')) = 'gestion') OR (((select private.page_level_rank(private.get_page_level('pdj'))) >= 2) AND (manual_kind IS NOT NULL) AND (service_date >= (CURRENT_DATE - 3)))));

commit;

-- VÉRIFICATION (lecture seule) — attendu : une ligne DELETE dont la condition
-- porte `manual_kind IS NOT NULL` et la fenêtre `CURRENT_DATE - 3`.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'pdj_breakfasts'
  and cmd = 'DELETE';
