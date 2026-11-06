-- Les TROIS NIVEAUX sont FIXES (décision de l'utilisateur du 2026-11-06, qui
-- renverse les niveaux réglables de 20261106140000 : « tu peux le mettre en
-- dur dans le moteur et non paramétrable, car c'est un truc qui couvre tous
-- les cas »).
--
-- Titulaire, Dépannage et Soutien sont écrits dans le code
-- (`src/lib/planning/niveaux.ts`) ; le calcul ne lit plus cette table. Elle
-- est GARDÉE (la retirer serait un retrait ; ses clés servent encore aux
-- triggers « niveau inconnu » des fiches et des besoins), mais FIGÉE : aucun
-- niveau ajouté ni retiré, aucune ligne modifiée.
--
-- AJOUT seul : une fonction et un trigger. Rien n'est retiré, aucune donnée
-- écrite. Les droits d'écriture restent accordés : le trigger refuse tout,
-- pour tout le monde (une copie de la prod passe en `replica`, sans
-- triggers).

create or replace function private.planning_niveaux_fixes() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.id = old.id
     and new.nom = old.nom
     and new.ordre = old.ordre
     and new.autonome = old.autonome
     and new.jamais_seul = old.jamais_seul then
    return new;
  end if;
  raise exception 'Les niveaux sont fixes : titulaire, dépannage et soutien.'
    using errcode = 'PL409';
end $$;
revoke all on function private.planning_niveaux_fixes() from public, anon, authenticated;

create trigger planning_niveaux_fixes
  before insert or update or delete on public.planning_niveaux
  for each row execute function private.planning_niveaux_fixes();

comment on table public.planning_niveaux is
  'Les trois niveaux FIXES (titulaire, dépannage, soutien), écrits dans le code (niveaux.ts) ; table figée par trigger (PL409), gardée pour les clés des fiches et des besoins.';
