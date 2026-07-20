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

drop policy if exists "learned_docs read (authenticated)" on public.facturation_learned_docs;
create policy "learned_docs read (authenticated)" on public.facturation_learned_docs
  for select to authenticated using (true);
-- Pas de policy INSERT/UPDATE/DELETE : seule la RPC SECURITY DEFINER écrit.

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
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
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
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
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
  if public.page_level_rank(public.get_page_level('facturation')) < 2 then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_learned_docs where hash = p_hash;
end;
$$;
