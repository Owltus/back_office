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
