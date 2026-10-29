-- Planning : durée d'une journée d'école (CFA) par personne (étape 9 du plan
-- planning-coherence-2026-10-28, décision D2 = A).
--
-- Code du travail L6222-24 : le temps passé au CFA est compris dans l'horaire
-- de travail. Une journée d'école entre donc dans les plafonds de la semaine
-- (48 h, 35 h pour un mineur, L3162-1). Durée en MINUTES, 7 h par défaut.
--
-- Ajout de colonne seulement (aucun retrait). Les grants et les policies de
-- la table couvrent la colonne ; l'import du prototype ne la connaît pas et
-- prend le défaut.

alter table public.planning_salaries
  add column heures_ecole_jour smallint not null default 420
    check (heures_ecole_jour between 0 and 600);

comment on column public.planning_salaries.heures_ecole_jour is
  'Durée comptée pour une journée d''école (CFA), en minutes : entre dans les plafonds de la semaine (L6222-24). 420 = 7 h par défaut.';
