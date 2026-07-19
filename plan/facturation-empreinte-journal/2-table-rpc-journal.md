# Étape 2 — Table + RPC journal (DB)

## Objectif

Créer la table persistante `facturation_learned_docs` (le journal) et ses RPC : enregistrer un
document appris (idempotent) et le désapprendre par hash (rejeu des deltas en soustraction, dans
une seule RPC transactionnelle), le tout au patron facturation existant.

## Contexte

Diagnostic de l'agent DB : toutes les tables facturation suivent le même moule (PK explicite, RLS +
policy SELECT seule, aucune policy d'écriture, RPC `security definer` + `set search_path = public` +
garde de rôle). Les deltas sont déjà passés en `jsonb` (`{ "token": n }`) et rejoués en soustraction
par `facturation_wordpool_unlearn` (`greatest(0, count - delta)` + purge des lignes à 0). Le journal
réutilise EXACTEMENT ces types (`codes text[]`, `deltas jsonb`) → le désapprentissage relit la ligne
et rejoue les deltas stockés. `to_regclass(...)` garde la tolérance si une table dépendante manque.

## Fichier(s) impacté(s)

- `supabase/facturation_learned_docs.sql` (nouveau, EXÉCUTÉ PAR L'UTILISATEUR)
- `supabase/facturation_reset_DANGER.sql` (modif : ajouter la table au `truncate` + à l'en-tête)

## Travail à réaliser

### 1. Table `facturation_learned_docs`

```sql
create table if not exists public.facturation_learned_docs (
  hash       text        primary key,                 -- SHA-256 hex (texte normalise si natif, octets si OCR)
  issuer     text,                                     -- cle emetteur canonique (issuerKey), nullable
  codes      text[]      not null default '{}',        -- codes valides (verite terrain, = learnedCodes)
  deltas     jsonb       not null default '{}'::jsonb, -- { "token": increment } rejouable en soustraction
  method     text        not null default 'native',   -- 'native' | 'ocr' (fiabilite du hash)
  created_at timestamptz not null default now()
);

create index if not exists facturation_learned_docs_issuer_idx
  on public.facturation_learned_docs (issuer);

alter table public.facturation_learned_docs enable row level security;

drop policy if exists "learned_docs read (authenticated)" on public.facturation_learned_docs;
create policy "learned_docs read (authenticated)" on public.facturation_learned_docs
  for select to authenticated using (true);
-- Pas de policy INSERT/UPDATE/DELETE : seule la RPC SECURITY DEFINER ecrit.
```

En-tête du fichier : assumer explicitement (D2) que cette table stocke un SAC DE MOTS par facture
(plus proche du contenu que les agrégats), non plafonnée par `prune` — surveiller la croissance.

### 2. RPC `_record` (enregistrer, idempotent)

```sql
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
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;

  insert into public.facturation_learned_docs (hash, issuer, codes, deltas, method)
  values (p_hash, nullif(p_issuer, ''), p_codes, coalesce(p_deltas, '{}'::jsonb),
          coalesce(nullif(p_method, ''), 'native'))
  on conflict (hash) do nothing; -- doublon : on garde le premier, jamais de double journal
end;
$$;
```

### 3. RPC `_forget` (désapprendre par hash — transactionnelle)

Relit la ligne, rejoue `deltas`/`codes` en soustraction sur `facturation_wordpool` ET
`facturation_issuer_codes` (+ `facturation_issuers` pour l'émetteur), puis supprime l'entrée. Le
corps plpgsql est atomique → soustraction + suppression indivisibles. Gardes `to_regclass`.

```sql
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
  if get_user_role() not in ('super_utilisateur', 'admin') then
    raise exception 'not authorized';
  end if;

  select hash, issuer, codes, deltas into d
  from public.facturation_learned_docs where hash = p_hash;
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

  -- 2. Co-occurrence emetteur->codes : -1 par code (miroir de _issuer_codes_unlearn).
  if d.issuer is not null and to_regclass('public.facturation_issuer_codes') is not null then
    update public.facturation_issuer_codes ic
       set count = greatest(0, ic.count - 1),
           updated_at = now()
    from unnest(d.codes) as c(code)
    where ic.issuer = d.issuer and ic.code = c.code;
    delete from public.facturation_issuer_codes where count <= 0;
  end if;

  -- 3. Dictionnaire emetteur : -1 (miroir de _issuer_unlearn).
  if d.issuer is not null and to_regclass('public.facturation_issuers') is not null then
    update public.facturation_issuers set count = greatest(0, count - 1), updated_at = now()
     where name = d.issuer;
    delete from public.facturation_issuers where name = d.issuer and count <= 0;
  end if;

  -- 4. Retirer l'entree du journal.
  delete from public.facturation_learned_docs where hash = p_hash;
end;
$$;
```

Note de cohérence (D2/agent DB) : le rejeu suppose `deltas` stocké == `deltas` appliqué au learn.
Comme les deltas sont figés au tampon (étape 5), la soustraction est exacte ; le `greatest(0, …)`
garantit l'absence de valeur négative en cas de résidu.

### 4. Ajout au reset

Dans `facturation_reset_DANGER.sql` : ajouter un bloc `truncate` conditionnel pour
`facturation_learned_docs` (même patron `to_regclass`) et la mentionner dans l'en-tête, sinon le
reset « total » laisserait le journal orphelin (et re-bloquerait les dépôts comme doublons).

## Ordre d'exécution

1. Écrire `facturation_learned_docs.sql` (table + `_record` + `_forget`).
2. Modifier `facturation_reset_DANGER.sql`.
3. Relecture par l'utilisateur, puis exécution DANS Supabase → SQL Editor (par l'utilisateur).

## Critère de validation

- Table `if not exists`, RLS activée, une seule policy SELECT `to authenticated`, aucune policy
  d'écriture. Script ré-exécutable.
- `_record` idempotent (`on conflict do nothing`) ; `_forget` rejoue les deltas puis supprime, le
  tout borné à 0 et purgé. Gardes de rôle + `search_path` + `to_regclass` présentes.
- `facturation_learned_docs` ajoutée au reset.

## Contrôle /borg

- **Sécurité RLS/RPC** : policy SELECT unique ; les deux RPC `security definer` +
  `set search_path = public` + garde `get_user_role() in ('super_utilisateur','admin')` ; aucune
  écriture directe possible (pas de policy write).
- **Réversibilité / isolation** : table préfixée `facturation_`, sans FK ni trigger sur d'autres
  tables ; rollback = `drop function facturation_learned_docs_record`, `..._forget`, `drop table
  facturation_learned_docs`. Aucun `ALTER` destructif sur une table existante.
- **Cohérence du rejeu** : `_forget` décrémente EXACTEMENT `deltas`/`codes`/`issuer` de la ligne,
  borné à 0 + purge — miroir fidèle de `_wordpool_unlearn` / `_issuer_codes_unlearn` /
  `_issuer_unlearn`. Vérifier qu'aucun compteur partagé d'une autre facture n'est touché au-delà
  de la soustraction des deltas de CE document.
- **Idempotence** : rejouer `_forget` sur un hash déjà supprimé ne fait rien (`if not found`).
