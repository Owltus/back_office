-- =============================================================================
-- REMPLACÉ le 2026-09-05 par supabase/private_rpc_relais.sql
-- (+ supabase/facturation_garde_null_2026-09-05.sql) — NE PLUS REJOUER.
-- Rejouer ce fichier recréerait une fonction security definer dans public
-- (Security Advisor rouvert, doublon avec le relais) ou une garde périmée.
-- Conservé pour l'historique.
-- (concaténation historique de tous les facturation_*.sql : tables incluses).
-- =============================================================================

-- =============================================================================
-- FACTURATION — VERROUILLAGE ADMIN-ONLY (feature en dev) : SCRIPT UNIQUE
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, EN UNE FOIS.
-- Regroupe les 10 fichiers facturation_*.sql (déjà à jour) : toutes les RPC
-- d'écriture facturation exigent désormais le niveau `gestion`
-- (get_page_level('facturation') <> 'gestion' -> raise 'not authorized'),
-- au lieu de « écriture (>= 2) ». Réservé à l'admin (qui a gestion partout).
--
-- IDEMPOTENT : create table if not exists, create policy précédé de drop if
-- exists, add column/constraint if (not) exists, fonctions en create or replace.
-- Aucun seed, aucun DROP TABLE, aucune donnée touchée. Ré-exécutable.
--
-- Miroir du verrou UI (src/components/facturation/FacturationBoard.tsx) et de
-- lib/permissions (gestion = admin). Généré par concaténation des fichiers
-- sources ; la référence reste chaque supabase/facturation_*.sql individuel.
-- =============================================================================


-- ================================================================
-- >>> supabase/facturation_wordpool.sql
-- ================================================================

-- =============================================================================
-- facturation_wordpool — nuages de mots pour l'imputation comptable auto (page
-- Facturation).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Table NOUVELLE, préfixée `facturation_`, indépendante des tables repjour
-- partagées (aucune écriture sur celles-ci). get_user_role() est supposée déjà
-- déployée (lit profiles.role de auth.uid()).
--
-- Modèle : un « nuage de mots » par code d'imputation = des compteurs de tokens
-- AGRÉGÉS. On ne stocke NI les PDF NI leur texte : uniquement des fréquences de
-- mots additionnées. La taille dépend du vocabulaire métier (qui sature), pas du
-- nombre de factures. Rien n'est reconstructible.
--
-- Écriture : JAMAIS en direct par le client. Seule la RPC SECURITY DEFINER
-- `facturation_wordpool_learn` écrit (incrément atomique par delta), avec garde
-- d'autorisation interne (super_utilisateur / admin) — car SECURITY DEFINER
-- contourne la RLS. Lecture : tout authentifié (le scoring se fait côté client).
-- Chargement app : TanStack Query, pas de Realtime.
-- =============================================================================

-- ---- Table ------------------------------------------------------------------
create table if not exists public.facturation_wordpool (
  code       text        not null,   -- code analytique d'imputation
  token      text        not null,   -- mot normalisé (sans accent, sans chiffre)
  count      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (code, token)
);

create index if not exists facturation_wordpool_code_idx
  on public.facturation_wordpool (code);

-- ---- RLS : lecture authentifiée, aucune écriture directe --------------------
alter table public.facturation_wordpool enable row level security;

-- RLS : les policies de cette table vivent dans page_permissions_rls*.sql et
-- les fichiers *_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy
-- ici : un rejeu rouvrirait les lectures et court-circuiterait permissions + fenetres.
-- Écriture : seule la RPC SECURITY DEFINER écrit (aucune policy INSERT/UPDATE/DELETE).

-- ---- RPC : apprentissage atomique par delta ---------------------------------
-- p_codes  : les codes finaux validés d'une facture (vérité terrain).
-- p_deltas : { "token": increment, ... } (les mots de CETTE facture).
create or replace function public.facturation_wordpool_learn(
  p_codes  text[],
  p_deltas jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  insert into public.facturation_wordpool (code, token, count)
  select c.code, d.key, d.value::int
  from unnest(p_codes) as c(code),
       jsonb_each_text(p_deltas) as d(key, value)
  on conflict (code, token)
  do update set count = facturation_wordpool.count + excluded.count,
                updated_at = now();
end;
$$;

-- ---- RPC : élagage (hygiène / bornage) --------------------------------------
-- 1) supprime les hapax (tokens vus < p_min_count fois),
-- 2) plafonne à p_top_k tokens par code (garde les plus fréquents).
-- À lancer ponctuellement (maintenance). Les mots ubiquitaires ont un poids
-- IDF ~ 0 au scoring : inoffensifs même s'ils restent ; le top-K finit par les
-- évincer.
create or replace function public.facturation_wordpool_prune(
  p_min_count int default 2,
  p_top_k     int default 300
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_wordpool where count < p_min_count;

  delete from public.facturation_wordpool w
  using (
    select code, token,
           row_number() over (partition by code order by count desc) as rn
    from public.facturation_wordpool
  ) r
  where w.code = r.code and w.token = r.token and r.rn > p_top_k;
end;
$$;


-- ================================================================
-- >>> supabase/facturation_issuers.sql
-- ================================================================

-- =============================================================================
-- facturation_issuers — dictionnaire des émetteurs de factures déjà rencontrés
-- (page Facturation), pour reconnaître et pré-remplir l'émetteur.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Table NOUVELLE, préfixée `facturation_`, indépendante des tables repjour
-- partagées. get_user_role() est supposée déjà déployée.
--
-- Un émetteur = un nom NORMALISÉ (clé, minuscule sans accent) + son nom
-- d'affichage lisible + un compteur de confirmations. On ne stocke aucun contenu
-- de facture ici, juste des noms d'émetteurs saisis par l'utilisateur.
--
-- Écriture : JAMAIS en direct par le client. Seule la RPC SECURITY DEFINER
-- `facturation_issuer_learn` écrit (upsert +1), avec garde d'autorisation interne
-- (super_utilisateur / admin) et garde de longueur (≥ 4 car.) anti faux-positifs.
-- Lecture : tout authentifié (le pré-remplissage se fait côté client).
-- =============================================================================

create table if not exists public.facturation_issuers (
  name       text        primary key,   -- normalize(supplierName).trim()
  display    text        not null,       -- dernière forme lisible saisie
  count      integer     not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.facturation_issuers enable row level security;

-- RLS : les policies de cette table vivent dans page_permissions_rls*.sql et
-- les fichiers *_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy
-- ici : un rejeu rouvrirait les lectures et court-circuiterait permissions + fenetres.
-- Écriture : seule la RPC SECURITY DEFINER écrit (aucune policy INSERT/UPDATE/DELETE).

-- p_name    : nom normalisé (clé) ; p_display : forme lisible à afficher.
create or replace function public.facturation_issuer_learn(
  p_name    text,
  p_display text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_name, '')) < 4 then
    return; -- garde anti faux-positifs (noms trop courts)
  end if;

  insert into public.facturation_issuers (name, display, count)
  values (p_name, p_display, 1)
  on conflict (name)
  do update set count = facturation_issuers.count + 1,
                display = excluded.display,
                updated_at = now();
end;
$$;


-- ================================================================
-- >>> supabase/facturation_issuer_codes.sql
-- ================================================================

-- =============================================================================
-- facturation_issuer_codes — co-occurrence ÉMETTEUR × CODE d'imputation.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Objectif : donner un « filtre fort par émetteur ». Pour un émetteur donné, on mémorise
-- combien de fois chaque code d'imputation a été VALIDÉ (au tamponnage). Ce signal est
-- SÉPARÉ du nuage de mots (facturation_wordpool) : il sert de PRIOR pour conditionner
-- l'attribution sans « collapser » un émetteur multi-articles (sa distribution reste
-- `{codeA:8, codeB:5}`). L'attribution reste pilotée par l'ÉDUCATION : rien n'est déduit
-- des libellés d'imputation, seulement de l'appris.
--
-- Mêmes règles de sécurité que l'existant : RLS + policy SELECT `authenticated`, AUCUNE
-- policy d'écriture directe, écritures via RPC SECURITY DEFINER avec garde de rôle, search_path
-- figé. `get_user_role()` supposée déjà déployée. Table isolée (aucune FK/trigger sur les
-- tables partagées repjour) → réversible par `drop table`.
-- =============================================================================

create table if not exists public.facturation_issuer_codes (
  issuer     text        not null,   -- clé émetteur = normalize(supplierName).trim()
  code       text        not null,   -- code analytique d'imputation
  count      integer     not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (issuer, code)
);

create index if not exists facturation_issuer_codes_issuer_idx
  on public.facturation_issuer_codes (issuer);

alter table public.facturation_issuer_codes enable row level security;

-- RLS : les policies de cette table vivent dans page_permissions_rls*.sql et
-- les fichiers *_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy
-- ici : un rejeu rouvrirait les lectures et court-circuiterait permissions + fenetres.

-- ---- RPC : apprentissage (+1 par code validé pour l'émetteur) ---------------
create or replace function public.facturation_issuer_codes_learn(
  p_issuer text,
  p_codes  text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_issuer, '')) < 4 then
    return; -- même garde anti faux-positifs que facturation_issuer_learn
  end if;

  insert into public.facturation_issuer_codes (issuer, code, count)
  select p_issuer, c.code, 1
  from unnest(p_codes) as c(code)
  on conflict (issuer, code)
  do update set count = facturation_issuer_codes.count + 1,
                updated_at = now();
end;
$$;

-- ---- RPC : désapprentissage symétrique (décrément borné + purge) ------------
create or replace function public.facturation_issuer_codes_unlearn(
  p_issuer text,
  p_codes  text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuer_codes w
     set count = greatest(0, w.count - 1),
         updated_at = now()
  from unnest(p_codes) as c(code)
  where w.issuer = p_issuer and w.code = c.code;

  delete from public.facturation_issuer_codes where count <= 0;
end;
$$;

-- ---- RPC : oubli complet d'un émetteur (delete/merge d'émetteur) ------------
create or replace function public.facturation_issuer_codes_forget(
  p_issuer text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_codes where issuer = p_issuer;
end;
$$;


-- ================================================================
-- >>> supabase/facturation_issuer_denylist.sql
-- ================================================================

-- =============================================================================
-- facturation_issuer_denylist — garde « cet émetteur ne va JAMAIS sur ce code ».
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Distinct du signal fréquentiel facturation_issuer_codes (co-occurrence POSITIVE) : ici
-- la PRÉSENCE d'une paire (issuer, code) = interdiction. La détection retire ce code des
-- candidats pour cet émetteur. Mêmes règles de sécurité que l'existant : RLS + policy
-- SELECT authenticated, AUCUNE policy d'écriture, écritures via RPC SECURITY DEFINER avec
-- garde de rôle, search_path figé. `get_user_role()` supposée déjà déployée. Table isolée
-- (aucune FK/trigger sur les tables partagées) → réversible par `drop table`.
-- =============================================================================

create table if not exists public.facturation_issuer_denylist (
  issuer     text        not null,   -- clé = normalize(supplierName).trim()
  code       text        not null,   -- code exclu des candidats pour cet émetteur
  created_at timestamptz not null default now(),
  primary key (issuer, code)
);

create index if not exists facturation_issuer_denylist_issuer_idx
  on public.facturation_issuer_denylist (issuer);

alter table public.facturation_issuer_denylist enable row level security;

-- RLS : les policies de cette table vivent dans page_permissions_rls*.sql et
-- les fichiers *_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy
-- ici : un rejeu rouvrirait les lectures et court-circuiterait permissions + fenetres.

-- ---- RPC : poser une interdiction (idempotent) ------------------------------
create or replace function public.facturation_issuer_denylist_add(
  p_issuer text,
  p_code   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_issuer, '')) < 4 then
    return; -- garde homogène anti faux-positifs
  end if;

  insert into public.facturation_issuer_denylist (issuer, code)
  values (p_issuer, p_code)
  on conflict (issuer, code) do nothing;
end;
$$;

-- ---- RPC : lever une interdiction (undo) ------------------------------------
create or replace function public.facturation_issuer_denylist_remove(
  p_issuer text,
  p_code   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuer_denylist
   where issuer = p_issuer and code = p_code;
end;
$$;


-- ================================================================
-- >>> supabase/facturation_learned_docs.sql
-- ================================================================

-- =============================================================================
-- facturation_learned_docs — JOURNAL D'APPRENTISSAGE par document (empreinte / hash).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Une ligne = un PDF appris, identifié par le HASH SHA-256 de son texte (natif) ou de ses
-- octets (OCR). On y fige ce que la facture a appris (codes, émetteur, deltas de mots), afin
-- de : (1) détecter un doublon au dépôt (hash déjà présent), (2) DÉSAPPRENDRE EXACTEMENT une
-- facture passée en rejouant ses deltas en soustraction, SANS re-déposer le PDF.
--
-- ⚠ CONFIDENTIALITÉ / VOLUMÉTRIE (assumé, version « complète ») : contrairement aux autres
-- tables facturation qui n'agrègent que des fréquences (rien de reconstructible), celle-ci
-- stocke un SAC DE MOTS par facture (`deltas`). Les tokens restent filtrés (sans chiffre, ni
-- date, ni stop-word, ni nom d'émetteur — cf. tokenize), mais la table croît avec le NOMBRE de
-- factures (non plafonnée par le prune des nuages). Surveiller la croissance.
--
-- Sécurité (identique à l'existant) : RLS + policy SELECT authenticated, AUCUNE policy
-- d'écriture, écritures via RPC SECURITY DEFINER à garde de rôle, search_path figé. Table
-- isolée (aucune FK/trigger) → réversible par `drop table` + `drop function`.
-- =============================================================================

create table if not exists public.facturation_learned_docs (
  hash       text        primary key,                  -- SHA-256 hex (texte normalisé si natif, octets si OCR)
  issuer     text,                                      -- clé émetteur canonique (issuerKey), nullable
  codes      text[]      not null default '{}',         -- codes validés (vérité terrain = learnedCodes)
  deltas     jsonb       not null default '{}'::jsonb,  -- { "token": increment } rejouable en soustraction
  method     text        not null default 'native',    -- 'native' | 'ocr' (fiabilité du hash)
  created_at timestamptz not null default now()
);

create index if not exists facturation_learned_docs_issuer_idx
  on public.facturation_learned_docs (issuer);

alter table public.facturation_learned_docs enable row level security;

-- RLS : les policies de cette table vivent dans page_permissions_rls*.sql et
-- les fichiers *_rls_fenetre_*.sql (autorité UNIQUE). Ne PAS recréer de policy
-- ici : un rejeu rouvrirait les lectures et court-circuiterait permissions + fenetres.
-- Écriture : seule la RPC SECURITY DEFINER écrit (aucune policy INSERT/UPDATE/DELETE).

-- ---- RPC : enregistrer un document appris (idempotent) ----------------------
create or replace function public.facturation_learned_docs_record(
  p_hash   text,
  p_issuer text,
  p_codes  text[],
  p_deltas jsonb,
  p_method text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_hash, '')) < 16 then
    return; -- garde : un hash SHA-256 fait 64 hex ; en deçà, entrée ignorée
  end if;

  insert into public.facturation_learned_docs (hash, issuer, codes, deltas, method)
  values (
    p_hash,
    nullif(p_issuer, ''),
    coalesce(p_codes, '{}'),
    coalesce(p_deltas, '{}'::jsonb),
    coalesce(nullif(p_method, ''), 'native')
  )
  on conflict (hash) do nothing; -- doublon : on garde le premier, jamais de double journal
end;
$$;

-- ---- RPC : désapprendre par hash (rejeu des deltas en soustraction, transactionnel) -------
-- Relit la ligne, rejoue EXACTEMENT ses deltas/codes/émetteur en soustraction (borné à 0,
-- purge des lignes vidées), puis supprime l'entrée. Le corps plpgsql est atomique. Gardes
-- to_regclass pour tolérer une table dépendante non déployée.
create or replace function public.facturation_learned_docs_forget(
  p_hash text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  -- `for update` : verrouille la ligne-journal. Deux appels CONCURRENTS (double-clic) ne
  -- peuvent pas rejouer la soustraction deux fois — le 2e attend, retrouve la ligne supprimée
  -- (not found) et sort sans re-décrémenter des compteurs partagés.
  select hash, issuer, codes, deltas into d
  from public.facturation_learned_docs where hash = p_hash
  for update;
  if not found then
    return;
  end if;

  -- 1. Nuages de mots : rejeu des deltas en soustraction (miroir de _wordpool_unlearn).
  if to_regclass('public.facturation_wordpool') is not null then
    update public.facturation_wordpool w
       set count = greatest(0, w.count - kv.value::int),
           updated_at = now()
    from unnest(d.codes) as c(code),
         jsonb_each_text(d.deltas) as kv(key, value)
    where w.code = c.code and w.token = kv.key;
    delete from public.facturation_wordpool where count <= 0;
  end if;

  -- 2. Co-occurrence émetteur→codes : -1 par code (miroir de _issuer_codes_unlearn).
  if d.issuer is not null and to_regclass('public.facturation_issuer_codes') is not null then
    update public.facturation_issuer_codes ic
       set count = greatest(0, ic.count - 1),
           updated_at = now()
    from unnest(d.codes) as c(code)
    where ic.issuer = d.issuer and ic.code = c.code;
    delete from public.facturation_issuer_codes where count <= 0;
  end if;

  -- 3. Dictionnaire émetteur : -1 (miroir de _issuer_unlearn).
  if d.issuer is not null and to_regclass('public.facturation_issuers') is not null then
    update public.facturation_issuers set count = greatest(0, count - 1), updated_at = now()
     where name = d.issuer;
    delete from public.facturation_issuers where name = d.issuer and count <= 0;
  end if;

  -- 4. Retirer l'entrée du journal.
  delete from public.facturation_learned_docs where hash = p_hash;
end;
$$;

-- ---- RPC : supprimer une entrée SANS rejeu (undo en séance) ------------------
-- Utilisé par « Annuler l'apprentissage » : le désapprentissage des compteurs est déjà fait
-- côté client (unlearnInvoiceCore) ; ici on ne fait QUE retirer l'entrée du journal, pour ne
-- pas décrémenter deux fois.
create or replace function public.facturation_learned_docs_delete(
  p_hash text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_learned_docs where hash = p_hash;
end;
$$;


-- ================================================================
-- >>> supabase/facturation_learned_docs_comptes.sql
-- ================================================================

-- ============================================================================
-- facturation_learned_docs — extension COMPTE + vue mémoire émetteur → couple.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_learned_docs.sql. Ré-exécutable. NON DESTRUCTIF de données :
--   * ADD COLUMN IF NOT EXISTS (les lignes existantes prennent le défaut '{}') ;
--   * DROP + CREATE de la SEULE fonction record (redéfinition de signature, aucune
--     donnée touchée : c'est du code, pas des lignes) ;
--   * CREATE OR REPLACE VIEW (objet dérivé, se recalcule à la lecture).
--
-- Pourquoi étendre le journal plutôt qu'une table « invoices » séparée : le journal
-- EST déjà l'historique par document (hash, issuer, codes, deltas, method). Il lui
-- manquait juste le COMPTE choisi. On ajoute donc `comptes` (map code → compte, en
-- miroir de InvoiceRecord.comptes) et on dérive de ce journal la MÉMOIRE émetteur →
-- (code, compte) : c'est elle qui, plus tard, pré-sélectionnera le compte habituel
-- d'un émetteur SANS toucher au prior émetteur → code (facturation_issuer_codes reste
-- l'unité pilote de l'apprentissage ; le compte n'est qu'une précision).
-- ============================================================================

-- 1) Colonne COMPTE par couple (map JSON code → compte choisi) ----------------
alter table public.facturation_learned_docs
  add column if not exists comptes jsonb not null default '{}'::jsonb;

-- 2) RPC record ÉTENDU : porte aussi les comptes (idempotent, garde de rôle) --
-- La signature gagne p_comptes → on DROP l'ancienne (5 args) avant de recréer,
-- pour éviter une surcharge fantôme (deux versions résolues au hasard par PostgREST).
-- Aucune donnée n'est touchée par ce drop/create (redéfinition de fonction).
drop function if exists public.facturation_learned_docs_record(text, text, text[], jsonb, text);
create or replace function public.facturation_learned_docs_record(
  p_hash    text,
  p_issuer  text,
  p_codes   text[],
  p_deltas  jsonb,
  p_method  text,
  p_comptes jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_hash, '')) < 16 then
    return; -- garde : un hash SHA-256 fait 64 hex ; en deçà, entrée ignorée
  end if;

  insert into public.facturation_learned_docs (hash, issuer, codes, deltas, method, comptes)
  values (
    p_hash,
    nullif(p_issuer, ''),
    coalesce(p_codes, '{}'),
    coalesce(p_deltas, '{}'::jsonb),
    coalesce(nullif(p_method, ''), 'native'),
    coalesce(p_comptes, '{}'::jsonb)
  )
  on conflict (hash) do nothing; -- doublon : on garde le premier, jamais de double journal
end;
$$;

-- 3) Vue MÉMOIRE émetteur → (code, compte), classée par fréquence -------------
-- Déplie chaque facture apprise en lignes (issuer, code, compte, n). `security_invoker`
-- pour que la RLS de facturation_learned_docs (lecture authentifiée) s'applique à
-- l'appelant, pas au propriétaire de la vue. Le compte vaut '' pour les factures
-- apprises AVANT cette extension (comptes = '{}') → filtrées à l'usage côté client.
create or replace view public.facturation_issuer_memory
with (security_invoker = true) as
  select
    d.issuer,
    c.code                                as code_analytique,
    coalesce(d.comptes ->> c.code, '')    as compte,
    count(*)::int                         as n
  from public.facturation_learned_docs d,
       unnest(d.codes) as c(code)
  where d.issuer is not null
  group by d.issuer, c.code, coalesce(d.comptes ->> c.code, '');

-- Contrôle : select * from public.facturation_issuer_memory order by issuer, n desc;


-- ================================================================
-- >>> supabase/facturation_ref_imputations_crud.sql
-- ================================================================

-- ============================================================================
-- facturation_ref_imputations — RPC CRUD unitaire au COUPLE (code + compte).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_ref_imputations.sql (la table doit exister). Ré-exécutable
-- (create or replace). Dépend de page_level_rank() / get_page_level() déjà déployées.
--
-- Complète le réimport EN MASSE (facturation_ref_imputations_rpc.sql) par l'édition
-- POINT PAR POINT depuis le gestionnaire « Gérer les imputations ». Une imputation =
-- un COUPLE (code_analytique, compte) : c'est la granularité de création/suppression.
-- section / libelle / description sont portés PAR COUPLE (aucune propagation implicite
-- aux autres comptes du même code — le réimport reste le canal d'édition en masse).
--
-- Écriture du référentiel UNIQUEMENT via RPC (la table n'a pas de policy write).
-- ============================================================================

-- 1) Upsert d'un couple (création + édition) ---------------------------------
-- p_create=true → CRÉATION : refuse d'écraser un couple déjà en base (unicité
-- SERVEUR, SQLSTATE 23505) ; ferme la fenêtre de cache périmé côté client.
create or replace function public.facturation_ref_upsert(
  p_code        text,
  p_compte      text,
  p_section     text,
  p_libelle     text,
  p_description text,
  p_sort        int default null,
  p_create      boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(trim(p_code), '')) < 3
     or char_length(coalesce(trim(p_compte), '')) < 1
     or char_length(coalesce(p_libelle, '')) < 1 then
    raise exception 'code (>= 3), compte et libelle requis';
  end if;
  if p_create and exists (
    select 1 from public.facturation_ref_imputations
    where code_analytique = trim(p_code) and compte = trim(p_compte)
  ) then
    raise exception 'imputation %/% existe deja', trim(p_code), trim(p_compte)
      using errcode = 'unique_violation';
  end if;

  insert into public.facturation_ref_imputations
    (code_analytique, compte, section, libelle, description, sort_order)
  values (
    trim(p_code),
    trim(p_compte),
    coalesce(p_section, ''),
    coalesce(p_libelle, ''),
    coalesce(p_description, ''),
    coalesce(p_sort, 0)
  )
  on conflict (code_analytique, compte) do update
    set section     = excluded.section,
        libelle     = excluded.libelle,
        description = excluded.description,
        sort_order  = coalesce(p_sort, facturation_ref_imputations.sort_order);
end;
$$;

-- 2) Suppression d'un couple avec garde « code encore utilisé » --------------
-- Retirer UN compte d'un code multi-comptes est toujours permis (le code subsiste).
-- En revanche, supprimer le DERNIER couple d'un code encore référencé dans les
-- données apprises effacerait son libellé alors qu'il sert toujours → refus
-- (SQLSTATE 23503, foreign_key_violation), comme l'ancienne garde par code. Chaque
-- test est protégé par to_regclass (tables dépendantes éventuellement non déployées).
create or replace function public.facturation_ref_delete(
  p_code   text,
  p_compte text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  -- Combien d'AUTRES comptes ce code garderait-il après suppression de ce couple ?
  select count(*) into remaining
  from public.facturation_ref_imputations
  where code_analytique = p_code and compte <> p_compte;

  -- Dernier couple du code + code encore utilisé → refus (perte d'un libellé actif).
  if remaining = 0 and (
       (to_regclass('public.facturation_wordpool') is not null
          and exists (select 1 from public.facturation_wordpool where code = p_code))
    or (to_regclass('public.facturation_issuer_codes') is not null
          and exists (select 1 from public.facturation_issuer_codes where code = p_code))
    or (to_regclass('public.facturation_issuer_denylist') is not null
          and exists (select 1 from public.facturation_issuer_denylist where code = p_code))
    or (to_regclass('public.facturation_learned_docs') is not null
          and exists (select 1 from public.facturation_learned_docs where p_code = any(codes)))
  ) then
    raise exception 'imputation % deja utilisee', p_code
      using errcode = 'foreign_key_violation';
  end if;

  delete from public.facturation_ref_imputations
  where code_analytique = p_code and compte = p_compte;
end;
$$;


-- ================================================================
-- >>> supabase/facturation_ref_imputations_rpc.sql
-- ================================================================

-- ============================================================================
-- facturation_ref_imputations — RPC de réimport (SECURITY DEFINER, garde de rôle).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_ref_imputations.sql. Ré-exécutable (create or replace).
-- Écriture du référentiel UNIQUEMENT via ces RPC (la table n'a pas de policy write).
-- Dépend de page_level_rank() / get_page_level() déjà déployées.
--
-- Deux modes :
--   * facturation_ref_reimport(jsonb)         : upsert ADDITIF (n'efface jamais).
--   * facturation_ref_reimport_replace(jsonb) : upsert + SUPPRESSION des couples
--       absents du fichier. DESTRUCTIF -> bloqué sans jeton dans la MÊME session :
--         set facturation.confirm_reimport = 'OUI_REMPLACER';
--
-- Format d'entrée : tableau JSON d'objets
--   {code_analytique, compte, section, libelle, description, sort_order?}
-- ============================================================================

-- 1) Réimport ADDITIF (upsert, jamais de suppression) ------------------------
create or replace function public.facturation_ref_reimport(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows doit etre un tableau JSON';
  end if;

  insert into public.facturation_ref_imputations
    (code_analytique, compte, section, libelle, description, sort_order)
  select
    trim(r->>'code_analytique'),
    trim(r->>'compte'),
    coalesce(r->>'section', ''),
    coalesce(r->>'libelle', ''),
    coalesce(r->>'description', ''),
    coalesce((r->>'sort_order')::int, 0)
  from jsonb_array_elements(p_rows) as r
  where coalesce(trim(r->>'code_analytique'), '') <> ''
    and coalesce(trim(r->>'compte'), '') <> ''
  on conflict (code_analytique, compte) do update
    set section    = excluded.section,
        libelle    = excluded.libelle,
        description = excluded.description,
        sort_order = excluded.sort_order;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- 2) Réimport REMPLAÇANT (upsert + suppression des couples absents) ----------
-- DESTRUCTIF : gardé par un jeton de confirmation posé dans la MÊME session :
--   set facturation.confirm_reimport = 'OUI_REMPLACER';
create or replace function public.facturation_ref_reimport_replace(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if current_setting('facturation.confirm_reimport', true) is distinct from 'OUI_REMPLACER' then
    raise exception
      'Reimport REMPLACANT bloque (destructif). Pour confirmer, execute d''abord dans CETTE session : set facturation.confirm_reimport = ''OUI_REMPLACER'';';
  end if;

  -- Upsert d'abord (réutilise la garde + l'insert additif ci-dessus).
  perform public.facturation_ref_reimport(p_rows);

  -- Puis suppression des couples ABSENTS du fichier fourni.
  delete from public.facturation_ref_imputations t
  where not exists (
    select 1 from jsonb_array_elements(p_rows) as r
    where trim(r->>'code_analytique') = t.code_analytique
      and trim(r->>'compte') = t.compte
  );
  get diagnostics removed = row_count;

  -- Consommer le jeton : un second remplacement redemandera confirmation.
  perform set_config('facturation.confirm_reimport', '', false);
  return removed;
end;
$$;


-- ================================================================
-- >>> supabase/facturation_corrections.sql
-- ================================================================

-- =============================================================================
-- facturation_corrections — outils de CORRECTION de l'apprentissage facturation.
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
--
-- Complète facturation_wordpool.sql / facturation_issuers.sql (déjà déployés). Les
-- apprentissages y sont ADDITIFS (compteurs). Ces RPC permettent de RÉPARER une erreur
-- de saisie : désapprendre une facture (décrément symétrique), renommer / fusionner /
-- supprimer un émetteur pollué. Mêmes règles que l'existant : SECURITY DEFINER (contourne
-- la RLS), garde de rôle interne (super_utilisateur / admin), search_path figé, aucune
-- policy d'écriture directe ajoutée. get_user_role() supposée déjà déployée.
-- =============================================================================

-- ---- Garde-fou : les compteurs ne descendent jamais sous 0 -------------------
alter table public.facturation_wordpool
  drop constraint if exists facturation_wordpool_count_nonneg;
alter table public.facturation_wordpool
  add constraint facturation_wordpool_count_nonneg check (count >= 0);

-- ---- RPC : désapprentissage (symétrique de _learn) --------------------------
-- Décrémente les compteurs des `p_codes` par `p_deltas` (le delta d'origine, rejoué
-- par l'appelant), borné à 0, puis purge les lignes vidées.
create or replace function public.facturation_wordpool_unlearn(
  p_codes  text[],
  p_deltas jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_wordpool w
     set count = greatest(0, w.count - d.value::int),
         updated_at = now()
  from unnest(p_codes) as c(code),
       jsonb_each_text(p_deltas) as d(key, value)
  where w.code = c.code and w.token = d.key;

  delete from public.facturation_wordpool where count <= 0;
end;
$$;

-- ---- RPC : purge complète d'un code mal imputé ------------------------------
-- Retire TOUS les tokens d'un code (ex. imputation entièrement erronée).
create or replace function public.facturation_wordpool_forget_code(
  p_code text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_wordpool where code = p_code;
end;
$$;

-- ---- RPC : oubli complet d'un couple émetteur→code --------------------------
-- Supprime toute la co-occurrence (issuer, code) apprise — « cette association est
-- fausse, enlève-la » (distinct de _unlearn qui ne décrémente que de 1). Garde to_regclass
-- au cas où issuer_codes ne serait pas déployé.
create or replace function public.facturation_issuer_codes_forget(
  p_issuer text,
  p_code   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  if to_regclass('public.facturation_issuer_codes') is not null then
    delete from public.facturation_issuer_codes
     where issuer = p_issuer and code = p_code;
  end if;
end;
$$;

-- ---- RPC : renommage d'un émetteur (name = clé primaire) --------------------
-- Fusion additive vers la nouvelle clé puis suppression de l'ancienne (atomique).
create or replace function public.facturation_issuer_rename(
  p_old_name text,
  p_new_name text,
  p_display  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  insert into public.facturation_issuers (name, display, count)
  select p_new_name, p_display, coalesce(count, 0)
  from public.facturation_issuers where name = p_old_name
  on conflict (name)
  do update set count   = facturation_issuers.count + excluded.count,
                display = excluded.display,
                updated_at = now();

  delete from public.facturation_issuers where name = p_old_name;

  -- Propager la co-occurrence émetteur→codes (si la table est déployée).
  if to_regclass('public.facturation_issuer_codes') is not null then
    insert into public.facturation_issuer_codes (issuer, code, count)
    select p_new_name, code, count
    from public.facturation_issuer_codes where issuer = p_old_name
    on conflict (issuer, code)
    do update set count = facturation_issuer_codes.count + excluded.count,
                  updated_at = now();
    delete from public.facturation_issuer_codes where issuer = p_old_name;
  end if;

  -- Propager la denylist émetteur↔code (si la table est déployée).
  if to_regclass('public.facturation_issuer_denylist') is not null then
    insert into public.facturation_issuer_denylist (issuer, code)
    select p_new_name, code
    from public.facturation_issuer_denylist where issuer = p_old_name
    on conflict (issuer, code) do nothing;
    delete from public.facturation_issuer_denylist where issuer = p_old_name;
  end if;
end;
$$;

-- ---- RPC : fusion de deux émetteurs (doublon d'orthographe) -----------------
create or replace function public.facturation_issuer_merge(
  p_from_name text,
  p_to_name   text,
  p_display   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuers t
     set count   = t.count + coalesce(f.count, 0),
         display = coalesce(p_display, t.display),
         updated_at = now()
  from public.facturation_issuers f
  where t.name = p_to_name and f.name = p_from_name;

  delete from public.facturation_issuers where name = p_from_name;

  -- Propager la co-occurrence émetteur→codes (si la table est déployée).
  if to_regclass('public.facturation_issuer_codes') is not null then
    insert into public.facturation_issuer_codes (issuer, code, count)
    select p_to_name, code, count
    from public.facturation_issuer_codes where issuer = p_from_name
    on conflict (issuer, code)
    do update set count = facturation_issuer_codes.count + excluded.count,
                  updated_at = now();
    delete from public.facturation_issuer_codes where issuer = p_from_name;
  end if;

  -- Propager la denylist émetteur↔code (si la table est déployée).
  if to_regclass('public.facturation_issuer_denylist') is not null then
    insert into public.facturation_issuer_denylist (issuer, code)
    select p_to_name, code
    from public.facturation_issuer_denylist where issuer = p_from_name
    on conflict (issuer, code) do nothing;
    delete from public.facturation_issuer_denylist where issuer = p_from_name;
  end if;
end;
$$;

-- ---- RPC : suppression d'un émetteur erroné ---------------------------------
create or replace function public.facturation_issuer_delete(
  p_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuers where name = p_name;

  -- Oublier aussi la co-occurrence émetteur→codes (si la table est déployée).
  if to_regclass('public.facturation_issuer_codes') is not null then
    delete from public.facturation_issuer_codes where issuer = p_name;
  end if;

  -- Oublier aussi la denylist émetteur↔code (si la table est déployée).
  if to_regclass('public.facturation_issuer_denylist') is not null then
    delete from public.facturation_issuer_denylist where issuer = p_name;
  end if;
end;
$$;

-- ---- RPC : décrément d'un émetteur (undo d'une confirmation) -----------------
-- Symétrique de _issuer_learn (+1). Décrémente de 1 ; supprime la ligne à 0 pour ne
-- pas laisser d'entrée fantôme. Ne descend jamais sous 0.
create or replace function public.facturation_issuer_unlearn(
  p_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuers
     set count = count - 1, updated_at = now()
   where name = p_name;

  delete from public.facturation_issuers where name = p_name and count <= 0;
end;
$$;


-- ================================================================
-- >>> supabase/facturation_budget_lines_rpc.sql
-- ================================================================

-- ============================================================================
-- facturation_budget_lines — RPC CRUD (SECURITY DEFINER, garde de rôle).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor, APRÈS
-- facturation_budget_lines.sql (la table doit exister). Ré-exécutable
-- (create or replace). Dépend de get_user_role() déjà déployée.
--
-- Écritures du référentiel UNIQUEMENT via ces RPC (la table n'a pas de policy write).
-- Le `code` est IMMUABLE : l'upsert met à jour par code, ne le renomme jamais (le code
-- est référencé comme chaîne dans facturation_wordpool / issuer_codes / issuer_denylist /
-- learned_docs — le renommer casserait ces références silencieusement).
-- ============================================================================

-- 1) Upsert (création + édition ; code immuable) -----------------------------
create or replace function public.facturation_budget_line_upsert(
  p_code     text,
  p_label    text,
  p_category text,
  p_hint     text,
  p_tags     text[],
  p_sort     int default null,
  p_create   boolean default false  -- true = CRÉATION : refuse d'écraser un code existant
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_code, '')) < 3 or char_length(coalesce(p_label, '')) < 1 then
    raise exception 'code (>= 3) et label requis';
  end if;
  -- Garde d'unicité SERVEUR à la création : ferme la fenêtre de cache périmé côté client
  -- (sinon un « Ajouter » sur un code déjà en base écraserait la ligne via le do update).
  if p_create and exists (
    select 1 from public.facturation_budget_lines where code = p_code
  ) then
    raise exception 'imputation % existe deja', p_code using errcode = 'unique_violation';
  end if;

  insert into public.facturation_budget_lines (code, label, category, hint, tags, sort_order)
  values (
    p_code,
    p_label,
    coalesce(p_category, ''),
    coalesce(p_hint, ''),
    coalesce(p_tags, '{}'),
    coalesce(p_sort, 0)
  )
  on conflict (code) do update
    set label      = excluded.label,
        category   = excluded.category,
        hint       = excluded.hint,
        tags       = excluded.tags,
        sort_order = coalesce(p_sort, facturation_budget_lines.sort_order);
end;
$$;

-- 2) Delete avec garde « déjà utilisée » -------------------------------------
-- Refuse la suppression si le code est référencé dans l'une des 4 tables apprises.
-- Chaque test est protégé par to_regclass (tables dépendantes éventuellement non déployées).
-- learned_docs.codes est un text[] → test `p_code = any(codes)`.
create or replace function public.facturation_budget_line_delete(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;

  if (to_regclass('public.facturation_wordpool') is not null
        and exists (select 1 from public.facturation_wordpool where code = p_code))
     or (to_regclass('public.facturation_issuer_codes') is not null
        and exists (select 1 from public.facturation_issuer_codes where code = p_code))
     or (to_regclass('public.facturation_issuer_denylist') is not null
        and exists (select 1 from public.facturation_issuer_denylist where code = p_code))
     or (to_regclass('public.facturation_learned_docs') is not null
        and exists (select 1 from public.facturation_learned_docs where p_code = any(codes)))
  then
    -- SQLSTATE 23503 (foreign_key_violation) → détectable côté front pour un message clair.
    raise exception 'imputation % deja utilisee', p_code
      using errcode = 'foreign_key_violation';
  end if;

  delete from public.facturation_budget_lines where code = p_code;
end;
$$;

-- ============================================================================
-- 3) AUDIT DES ORPHELINS (lecture seule) — à lancer AVANT d'envisager toute FK dure.
-- Liste les codes présents dans les données APPRISES mais ABSENTS du référentiel.
-- Si le résultat est NON VIDE : ne PAS poser de clés étrangères (elles échoueraient) ;
-- s'appuyer sur la garde applicative ci-dessus. Décommenter pour exécuter.
-- ----------------------------------------------------------------------------
-- select distinct code as code_orphelin, 'wordpool' as source
--   from public.facturation_wordpool
--   where code not in (select code from public.facturation_budget_lines)
-- union
-- select distinct code, 'issuer_codes'
--   from public.facturation_issuer_codes
--   where code not in (select code from public.facturation_budget_lines)
-- union
-- select distinct code, 'issuer_denylist'
--   from public.facturation_issuer_denylist
--   where code not in (select code from public.facturation_budget_lines)
-- union
-- select distinct c, 'learned_docs'
--   from public.facturation_learned_docs, unnest(codes) as c
--   where c not in (select code from public.facturation_budget_lines)
-- order by source, code_orphelin;
-- ============================================================================
