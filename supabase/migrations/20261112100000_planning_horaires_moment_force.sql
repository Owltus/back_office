-- Moment d'un horaire placé À LA MAIN (2026-11-12, demande utilisateur :
-- « déplacer les horaires de matin, middle, soir et nuit avec un
-- glisser-déposer… qu'elle les déplace au bon endroit »).
--
-- Le moment se calcule d'après les heures (`momentFixe`). Quand cette case
-- est vraie, la colonne `periode` fait foi : le calcul et les écrans la
-- gardent telle quelle, et la couleur suit. Remettre l'horaire dans le
-- tableau de son moment calculé remet la case à faux.
--
-- Ajout seul : défaut faux, aucun horaire ne change.

alter table public.planning_horaires
  add column moment_force boolean not null default false;

comment on column public.planning_horaires.moment_force is
  'Moment placé à la main (glisser-déposer de la page Horaires) : periode fait foi au lieu du calcul d''après les heures.';
