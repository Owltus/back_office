-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante des tables repjour partagées (lecture seule).
--
-- Suivi ménage : UNE ligne par (jour, chambre). Deux dimensions ORTHOGONALES :
--   • status (couleur) : NULL = aucune couleur (chambre non vendue laissée grise,
--     OU chambre vendue au défaut « nettoyée ») ; sinon nettoyee | non_nettoyee
--     (« Bloquée ») | refus, toujours stockée telle quelle. L'absence de ligne
--     vaut donc « aucune couleur » (grise si non vendue, verte si vendue).
--   • carried_manual : sur-statut « bloquée la veille » posé à la main (liseré).
-- Une ligne peut n'exister QUE pour porter le liseré (status NULL, carried_manual
-- true) : d'où le status NULLABLE. La dimension `qualifier` (« faux no-show ») a
-- été abandonnée — retrait non destructif via rapro_rooms_drop_qualifier.sql.
--
-- ⚠ PREMIER DÉPLOIEMENT UNIQUEMENT : le `drop table … cascade` ci-dessous EFFACE
--   toute donnée existante. Il est NEUTRALISÉ (commenté) pour qu'un rejeu par
--   réflexe ne perde pas le suivi ménage en prod. Le `create table if not exists`
--   rend le fichier sûr à rejouer. Pour une vraie ré-initialisation, décommenter
--   SCIEMMENT la ligne suivante.
-- drop table if exists public.rapro_rooms cascade;

create table if not exists public.rapro_rooms (
  id          uuid primary key default gen_random_uuid(),
  report_date date not null,
  room        smallint not null,
  -- NULLABLE : NULL = aucune couleur (voir en-tête). Pas de défaut (une ligne
  -- sans couleur explicite reste NULL) ; le CHECK laisse passer NULL.
  status      text check (status is null or status in ('nettoyee', 'non_nettoyee', 'refus')),
  -- Sur-statut « bloquée la veille » POSÉ À LA MAIN (orthogonal au status) :
  -- permet de marquer un report tardif directement sur le jour courant. Traité
  -- par le roulement comme une origine (cf. lib/rapro/carryover.ts).
  carried_manual boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Clé d'upsert. Son index couvre aussi les lectures par report_date (colonne
  -- de tête), donc pas d'index supplémentaire nécessaire.
  unique (report_date, room)
);

-- Trigger d'estampillage SERVEUR (updated_at + created_by).
-- SÉCURITÉ : created_by est posé ICI (auth.uid()), jamais accepté du client, et
-- figé après création — pas d'attribution d'une écriture à l'UUID d'un tiers.
create or replace function public.rapro_rooms_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists rapro_rooms_set_updated_at on public.rapro_rooms;
drop trigger if exists rapro_rooms_stamp on public.rapro_rooms;
create trigger rapro_rooms_stamp
  before insert or update on public.rapro_rooms
  for each row execute function public.rapro_rooms_stamp();

-- RLS : lecture pour tout authentifié, écriture réservée super_utilisateur/admin.
-- get_user_role() est supposée DÉJÀ déployée (partagée avec caisse/pdj).
alter table public.rapro_rooms enable row level security;

-- RLS : les policies de cette table vivent dans page_permissions_rls*.sql et
-- les fichiers *_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy
-- ici : un rejeu rouvrirait les lectures et court-circuiterait permissions + fenetres.
