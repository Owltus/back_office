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
  if get_user_role() not in ('super_utilisateur', 'admin') then
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
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_wordpool where code = p_code;
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
  if get_user_role() not in ('super_utilisateur', 'admin') then
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
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuers t
     set count   = t.count + coalesce(f.count, 0),
         display = coalesce(p_display, t.display),
         updated_at = now()
  from public.facturation_issuers f
  where t.name = p_to_name and f.name = p_from_name;

  delete from public.facturation_issuers where name = p_from_name;
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
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;

  delete from public.facturation_issuers where name = p_name;
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
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;

  update public.facturation_issuers
     set count = count - 1, updated_at = now()
   where name = p_name;

  delete from public.facturation_issuers where name = p_name and count <= 0;
end;
$$;
