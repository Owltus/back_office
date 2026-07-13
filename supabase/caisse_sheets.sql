-- =============================================================================
-- caisse_sheets — feuilles de caisse persistées par jour + shift (page Caisse)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Table NOUVELLE, indépendante des tables repjour partagées (aucune écriture
-- sur celles-ci). get_user_role() est supposée déjà déployée.
--
-- Une ligne = un couple (report_date, shift). Elle confronte les montants
-- attendus (StayNTouch réception + Lightspeed club) aux montants réels comptés
-- (CAISSE), porte le comptage du fond de caisse (15 coupures, cible 150 €), un
-- commentaire, et l'état de validation.
--
-- VERROU (D1) : une feuille « validée » n'est plus modifiable, SAUF (a) pendant
-- une fenêtre de grâce de 24 h après validation, et (b) pour un admin (jamais
-- bloqué). Ce verrou est appliqué par la RLS (autorité réelle) ; l'UI n'en est
-- que le reflet ergonomique. Si la durée change, ajuster À LA FOIS l'interval
-- ci-dessous ET la constante GRACE_HOURS dans src/lib/caisse/constants.ts.
--
-- Droits (D6/D7) : lecture pour tous les authentifiés ; création + édition
-- réservées à super_utilisateur / admin (édition soumise au verrou) ;
-- suppression réservée à l'admin (pièce comptable).
-- Chargement app (D3) : TanStack Query, pas de Realtime.
-- =============================================================================

-- ---- Table + index ----------------------------------------------------------
create table if not exists public.caisse_sheets (
  id                uuid primary key default gen_random_uuid(),
  report_date       date not null,                              -- date de la feuille
  shift             text not null check (shift in ('matin', 'soir', 'nuit')),
  operator_initials text not null default '',                   -- initiales hôtelier (ex. "cbs")

  -- STAY N' TOUCH (réception) — montants attendus
  snt_cash          numeric(10, 2) not null default 0,
  snt_cb            numeric(10, 2) not null default 0,          -- carte bancaire
  snt_cvac          numeric(10, 2) not null default 0,
  snt_cbweb         numeric(10, 2) not null default 0,          -- CB WEB (toutes) — soir

  -- LIGHTSPEED (club) — montants attendus
  ls_cash           numeric(10, 2) not null default 0,
  ls_cb             numeric(10, 2) not null default 0,
  ls_cvac           numeric(10, 2) not null default 0,

  -- CAISSE — montants réels comptés
  caisse_cash       numeric(10, 2) not null default 0,
  caisse_cb         numeric(10, 2) not null default 0,
  caisse_cvac       numeric(10, 2) not null default 0,
  caisse_adyen      numeric(10, 2) not null default 0,          -- ADYEN — soir

  -- Comptage du fond de caisse (nombre de coupures / pièces) — D4
  cnt_500           smallint not null default 0,
  cnt_200           smallint not null default 0,
  cnt_100           smallint not null default 0,
  cnt_50            smallint not null default 0,
  cnt_20            smallint not null default 0,
  cnt_10            smallint not null default 0,
  cnt_5             smallint not null default 0,
  cnt_2             smallint not null default 0,
  cnt_1             smallint not null default 0,
  cnt_050           smallint not null default 0,                -- 0,50 €
  cnt_020           smallint not null default 0,                -- 0,20 €
  cnt_010           smallint not null default 0,                -- 0,10 €
  cnt_005           smallint not null default 0,                -- 0,05 €
  cnt_002           smallint not null default 0,                -- 0,02 €
  cnt_001           smallint not null default 0,                -- 0,01 €

  fund_origin       numeric(10, 2) not null default 150,        -- fond de caisse d'origine (150 €)
  comment           text not null default '',

  -- Validation / verrouillage
  status            text not null default 'draft'
                      check (status in ('draft', 'validated')),
  validated_at      timestamptz,                                -- horodatage de validation
  validated_by      uuid,                                       -- signature (auteur)
  countersigned_by  uuid,                                       -- contre-signature (optionnel, D5)

  created_by        uuid not null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (report_date, shift)                                   -- clé d'upsert idempotent (D9)
);

create index if not exists caisse_sheets_report_date_idx
  on public.caisse_sheets (report_date desc);

-- ---- Trigger d'estampillage SERVEUR (updated_at + identité + validation) -----
-- SÉCURITÉ : validated_at, validated_by et created_by sont posés ICI, côté
-- serveur, et JAMAIS acceptés du client. Sans cela, un super_utilisateur pouvait
-- (a) post-dater `validated_at` pour que la fenêtre de grâce de 24 h ne se ferme
-- jamais (verrou D1 contourné), et (b) signer une feuille sous l'UUID d'un tiers.
-- Le trigger écrase toute valeur envoyée par le client → la policy temporelle
-- ci-dessous redevient fiable, et la signature reflète l'appelant réel.
create or replace function public.caisse_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();                     -- création figée à l'appelant
    if new.status = 'validated' then
      new.validated_at := now();                      -- horodatage SERVEUR
      new.validated_by := auth.uid();                 -- signature = appelant réel
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else -- UPDATE
    new.created_by := old.created_by;                 -- created_by non réécrivable
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();                    -- (re)validation → maintenant
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;         -- déjà validée : figée (pas de post-datage)
        new.validated_by := old.validated_by;
      end if;
    else -- réouverture (retour en 'draft')
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;

-- Remplace l'ancien trigger updated_at seul (caisse_stamp() couvre updated_at).
drop trigger if exists caisse_sheets_set_updated_at on public.caisse_sheets;
drop trigger if exists caisse_sheets_stamp on public.caisse_sheets;
create trigger caisse_sheets_stamp
  before insert or update on public.caisse_sheets
  for each row execute function public.caisse_stamp();

-- ---- RLS --------------------------------------------------------------------
alter table public.caisse_sheets enable row level security;

-- SELECT : tous les authentifiés
drop policy if exists "caisse read (authenticated)" on public.caisse_sheets;
create policy "caisse read (authenticated)"
  on public.caisse_sheets for select
  to authenticated using (true);

-- INSERT : super/admin
drop policy if exists "caisse insert (super/admin)" on public.caisse_sheets;
create policy "caisse insert (super/admin)"
  on public.caisse_sheets for insert
  to authenticated
  with check (get_user_role() in ('super_utilisateur', 'admin'));

-- UPDATE : super/admin ET (admin OU pas encore validé OU dans la fenêtre de grâce)
-- La clause `using` s'évalue sur la ligne EXISTANTE : au moment où un
-- super_utilisateur valide, validated_at est encore NULL → l'UPDATE passe. Les
-- corrections ultérieures passent tant que now() < validated_at + 24h. Ensuite,
-- seul l'admin peut modifier (correction ou remise en brouillon = déverrouillage).
drop policy if exists "caisse update (role + verrou)" on public.caisse_sheets;
create policy "caisse update (role + verrou)"
  on public.caisse_sheets for update
  to authenticated
  using (
    get_user_role() in ('super_utilisateur', 'admin')
    and (
      get_user_role() = 'admin'
      or validated_at is null
      or now() < validated_at + interval '24 hours'
    )
  )
  with check (
    get_user_role() in ('super_utilisateur', 'admin')
    and (
      get_user_role() = 'admin'
      or validated_at is null
      or now() < validated_at + interval '24 hours'
    )
  );

-- DELETE : admin seulement (une feuille validée est une pièce comptable) — D7
drop policy if exists "caisse delete (admin)" on public.caisse_sheets;
create policy "caisse delete (admin)"
  on public.caisse_sheets for delete
  to authenticated
  using (get_user_role() = 'admin');

-- ---- Migration : retrait des modes American Express (AX) et Chèques (CHEQ) ---
-- Ces deux modes de paiement ne sont pas utilisés en réalité. On supprime les
-- colonnes correspondantes des trois blocs (StayNTouch, Lightspeed, Caisse).
-- Idempotent (drop column if exists) : sans effet sur une base déjà migrée ou
-- fraîchement créée sans ces colonnes.
alter table public.caisse_sheets drop column if exists snt_ax;
alter table public.caisse_sheets drop column if exists snt_cheq;
alter table public.caisse_sheets drop column if exists ls_ax;
alter table public.caisse_sheets drop column if exists ls_cheq;
alter table public.caisse_sheets drop column if exists caisse_ax;
alter table public.caisse_sheets drop column if exists caisse_cheq;
