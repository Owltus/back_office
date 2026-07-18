# Étape 3 — Persistance Supabase (table + RPC)

## Objectif

Persister le modèle émetteur→codes en base, en respectant STRICTEMENT les patterns de
sécurité existants : nouvelle table `facturation_issuer_codes`, lecture sous RLS, écriture
uniquement via RPC `SECURITY DEFINER` avec garde de rôle. Fournir les wrappers TS de
lecture/apprentissage/désapprentissage. SQL exécuté par l'UTILISATEUR.

## Contexte

Diagnostic de l'agent DB : les tables `facturation_wordpool` (PK `code,token`) et
`facturation_issuers` (PK `name`) suivent un patron clair (RLS + policy SELECT `to
authenticated using(true)`, aucune policy d'écriture, RPC `security definer` + garde
`get_user_role() in ('super_utilisateur','admin')` + `search_path = public`). On reproduit
ce patron à l'identique. Option A retenue (table de co-occurrence) — bornée par
émetteurs × codes, réversible, isolée des tables partagées.

## Fichier(s) impacté(s)

- `supabase/facturation_issuer_codes.sql` (nouveau, exécuté par l'utilisateur)
- `supabase/facturation_corrections.sql` (modif : propager rename/merge/delete émetteur)
- `src/lib/facturation/cloudService.ts` (wrappers TS)

## Travail à réaliser

### 1. Table + RPC (nouveau SQL, ré-exécutable)

```sql
create table if not exists public.facturation_issuer_codes (
  issuer     text        not null,   -- = normalize(supplierName).trim() (clé, cf. D2)
  code       text        not null,
  count      integer     not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (issuer, code)
);
create index if not exists facturation_issuer_codes_issuer_idx
  on public.facturation_issuer_codes (issuer);

alter table public.facturation_issuer_codes enable row level security;
drop policy if exists "issuer_codes read (authenticated)" on public.facturation_issuer_codes;
create policy "issuer_codes read (authenticated)" on public.facturation_issuer_codes
  for select to authenticated using (true);

-- Apprentissage : +1 sur chaque code validé pour cet émetteur.
create or replace function public.facturation_issuer_codes_learn(p_issuer text, p_codes text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if get_user_role() not in ('super_utilisateur','admin') then raise exception 'not authorized'; end if;
  if char_length(coalesce(p_issuer,'')) < 4 then return; end if;
  insert into public.facturation_issuer_codes (issuer, code, count)
  select p_issuer, c.code, 1 from unnest(p_codes) as c(code)
  on conflict (issuer, code) do update
    set count = facturation_issuer_codes.count + 1, updated_at = now();
end; $$;

-- Désapprentissage symétrique (décrément borné + purge).
create or replace function public.facturation_issuer_codes_unlearn(p_issuer text, p_codes text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if get_user_role() not in ('super_utilisateur','admin') then raise exception 'not authorized'; end if;
  update public.facturation_issuer_codes w set count = greatest(0, w.count - 1), updated_at = now()
  from unnest(p_codes) as c(code) where w.issuer = p_issuer and w.code = c.code;
  delete from public.facturation_issuer_codes where count <= 0;
end; $$;

-- Purge d'un émetteur entier (utilisé par delete/merge d'émetteur).
create or replace function public.facturation_issuer_codes_forget(p_issuer text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if get_user_role() not in ('super_utilisateur','admin') then raise exception 'not authorized'; end if;
  delete from public.facturation_issuer_codes where issuer = p_issuer;
end; $$;
```

### 2. Propager rename/merge/delete d'émetteur (facturation_corrections.sql)

Les RPC `facturation_issuer_rename/merge/delete` doivent aussi ré-agréger
`facturation_issuer_codes` (sinon la clé `issuer` diverge du dictionnaire). Ajouter dans
chacune un `update ... set issuer = p_new/p_to` avec ré-agrégation `on conflict` (rename,
merge) et un `delete ... where issuer = p_name` (delete).

### 3. Wrappers TS (cloudService.ts)

```ts
export async function fetchIssuerCodes(): Promise<IssuerCodes>          // SELECT issuer, code, count (paginé)
export async function learnIssuerCodes(issuer: string, codes: string[]): Promise<void>   // RPC _learn
export async function unlearnIssuerCodes(issuer: string, codes: string[]): Promise<void> // RPC _unlearn
```

Même style que `learnClouds`/`fetchClouds` (propagation d'erreur, dégradation gracieuse si
table absente).

## Ordre d'exécution

1. Écrire `supabase/facturation_issuer_codes.sql` + patch `facturation_corrections.sql`.
2. Ajouter les wrappers dans `cloudService.ts`.
3. Demander à l'utilisateur d'exécuter les deux SQL dans Supabase (ordre : issuer_codes
   puis corrections). L'assistant n'exécute JAMAIS le SQL.
4. `npx tsc --noEmit`.

## Critère de validation

- Le SQL est ré-exécutable (`if not exists`, `create or replace`, `drop policy if exists`).
- Écriture impossible hors RPC (aucune policy INSERT/UPDATE/DELETE), garde de rôle présente.
- Les wrappers TS compilent et retournent des valeurs vides en cas de table absente.
- `npx tsc --noEmit` vert.

## Contrôle /borg

- **Sécurité RLS/RPC** : la nouvelle table n'a QUE la policy SELECT ; toutes les RPC ont la
  garde `get_user_role() in ('super_utilisateur','admin')`, `security definer`,
  `search_path = public`. Aucune écriture directe possible.
- **Isolation** : la table est nouvelle, préfixée `facturation_`, sans FK ni trigger sur les
  tables partagées (repjour) → aucun risque pour l'app en production.
- **Réversibilité** : rollback = `drop table facturation_issuer_codes cascade` + `drop
  function` ; aucun `ALTER` destructif sur une table existante.
- **Cohérence de clé** : `issuer` = même `normalize(...).trim()` que `facturation_issuers.name`
  (D2) ; rename/merge/delete propagent bien vers la nouvelle table (pas de dérive).
