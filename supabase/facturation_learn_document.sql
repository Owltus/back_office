-- =============================================================================
-- facturation_learn_document — apprentissage IDEMPOTENT d'une facture (A1, pentest #2)
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor. Ré-exécutable.
-- Prérequis : facturation_wordpool.sql, facturation_issuers.sql,
-- facturation_issuer_codes.sql, facturation_learned_docs(.sql + _comptes.sql) déjà déployés.
--
-- POURQUOI
--   Avant, le client appelait EN SÉQUENCE et NON atomiquement : learnClouds +
--   learnIssuerCodes + learnIssuer + recordLearnedDoc. Seul le journal était
--   idempotent (on conflict hash) ; les 3 incréments ne l'étaient PAS. Deux onglets
--   (ou un rejeu après échec avalé) incrémentaient 2× les compteurs alors que
--   `forget` ne décrémente qu'1× → inflation PERMANENTE des poids TF-IDF, biaisant
--   le routage comptable.
--
--   Cette RPC fait tout d'un bloc (transaction plpgsql) et GATE les incréments sur
--   l'insertion RÉELLE au journal : si le hash existe déjà (doublon / concurrence),
--   `IF NOT FOUND` sort sans rien incrémenter. Les incréments réutilisent les RPC
--   existantes (PERFORM) → garantis symétriques avec facturation_learned_docs_forget.
--
-- SÛR EN PRODUCTION : additif (une fonction), aucune donnée touchée.
-- =============================================================================

create or replace function public.facturation_learn_document(
  p_hash    text,
  p_issuer  text,
  p_display text,
  p_codes   text[],
  p_deltas  jsonb,
  p_comptes jsonb,
  p_method  text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_page_level('facturation') <> 'gestion' then
    raise exception 'not authorized';
  end if;
  if char_length(coalesce(p_hash, '')) < 16 then
    return false;                       -- hash invalide : rien appris
  end if;

  -- Journal en PREMIER : c'est lui qui décide de l'idempotence.
  insert into public.facturation_learned_docs (hash, issuer, codes, deltas, method, comptes)
  values (
    p_hash,
    nullif(p_issuer, ''),
    coalesce(p_codes, '{}'),
    coalesce(p_deltas, '{}'::jsonb),
    coalesce(nullif(p_method, ''), 'native'),
    coalesce(p_comptes, '{}'::jsonb)
  )
  on conflict (hash) do nothing;

  if not found then
    return false;                       -- déjà appris → AUCUN incrément (idempotent)
  end if;

  -- Incréments UNE seule fois, dans la même transaction, via les RPC existantes
  -- (mêmes corps que ceux que `forget` inverse → symétrie garantie).
  perform public.facturation_wordpool_learn(
    coalesce(p_codes, '{}'), coalesce(p_deltas, '{}'::jsonb)
  );
  if nullif(p_issuer, '') is not null then
    perform public.facturation_issuer_codes_learn(nullif(p_issuer, ''), coalesce(p_codes, '{}'));
    perform public.facturation_issuer_learn(nullif(p_issuer, ''), nullif(p_display, ''));
  end if;

  return true;                          -- nouvellement appris
end;
$$;

revoke all on function public.facturation_learn_document(text, text, text, text[], jsonb, jsonb, text)
  from public, anon;
grant execute on function public.facturation_learn_document(text, text, text, text[], jsonb, jsonb, text)
  to authenticated;

-- Vérification (lecture seule) :
--   select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.proname='facturation_learn_document') as ok;
