-- =============================================================================
-- literie_sheets — feuille du jour literie (commentaire + clôture) (page 'literie')
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Table NOUVELLE, indépendante. Même principe que rapro_sheets/caisse_sheets :
-- un commentaire libre et un statut de clôture par jour.
--
-- VERROU : une feuille « validée » n'est plus modifiable, SAUF (a) pendant la
-- fenêtre de grâce LITERIE_GRACE_DAYS (voir literie_rls.sql), et (b) pour un
-- admin/gestion (jamais bloqué). Ce verrou est appliqué par la RLS (autorité
-- réelle) ; l'UI n'en est que le reflet ergonomique.
-- =============================================================================

-- ---- Table ------------------------------------------------------------------
create table if not exists public.literie_sheets (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null unique,
  comment       text not null default '',
  status        text not null default 'draft'
                  check (status in ('draft', 'validated')),
  validated_at  timestamptz,
  validated_by  uuid,
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---- Trigger d'estampillage SERVEUR (copie conforme de caisse_stamp()) ------
-- validated_at/validated_by/created_by jamais acceptés du client : posés ici,
-- côté serveur, pour empêcher un post-datage de validated_at (contournement de
-- la fenêtre de grâce) ou une signature sous l'identité d'un tiers.
create or replace function public.literie_sheets_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'validated' then
      new.validated_at := now();
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else
    new.created_by := old.created_by;
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := old.validated_by;
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists literie_sheets_stamp on public.literie_sheets;
create trigger literie_sheets_stamp
  before insert or update on public.literie_sheets
  for each row execute function public.literie_sheets_stamp();

-- ---- RLS ------------------------------------------------------------------
alter table public.literie_sheets enable row level security;

-- Policies (lecture + écriture via literie_rls.sql — autorité unique pour
-- la page 'literie'). Ne PAS recréer de policy ici.
