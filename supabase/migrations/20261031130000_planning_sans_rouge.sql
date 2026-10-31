-- Plus d'« heures écrites en rouge » (demande utilisateur du 2026-10-31 :
-- « retire même l'option, c'est un peu étrange ; retire vraiment tout,
-- l'option et le fait que ce soit rouge »). La colonne `code_rouge`
-- (migration 20261028100000) ne sert plus à rien : supprimée.

alter table public.planning_horaires drop column code_rouge;
