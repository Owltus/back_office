# Étape 5 — Denylist émetteur↔code (DB + détection)

## Objectif

Permettre de déclarer « cet émetteur ne va JAMAIS sur ce code » : un garde binaire qui
exclut ce code des candidats pour cet émetteur, en respectant le canon Supabase (RPC
`SECURITY DEFINER`, SQL exécuté par l'utilisateur).

## Contexte

Diagnostic des agents : distinct du signal fréquentiel `facturation_issuer_codes`
(co-occurrence positive), la denylist est une paire interdite (présence = interdit). Même
gabarit que `facturation_issuer_codes.sql`. Elle se branche dans la détection en retirant
les codes bannis des candidats (y compris ceux d'une règle de couche 1).

## Fichier(s) impacté(s)

- `supabase/facturation_issuer_denylist.sql` (nouveau, exécuté par l'utilisateur)
- `supabase/facturation_corrections.sql` (modif : propager rename/merge/delete)
- `src/lib/facturation/cloudService.ts` (wrappers)
- `src/lib/facturation/issuerDenylist.ts` (nouveau, pur)
- `src/lib/facturation/detect.ts` (garde dans la détection)
- `src/components/facturation/useFacturationModel.ts` (4e query)
- `src/lib/facturation/facturation.test.ts`

## Travail à réaliser

### 1. Table + RPC (SQL)

```sql
create table if not exists public.facturation_issuer_denylist (
  issuer     text not null,
  code       text not null,
  created_at timestamptz not null default now(),
  primary key (issuer, code)
);
create index if not exists facturation_issuer_denylist_issuer_idx on public.facturation_issuer_denylist (issuer);
alter table public.facturation_issuer_denylist enable row level security;
drop policy if exists "issuer_denylist read (authenticated)" on public.facturation_issuer_denylist;
create policy "issuer_denylist read (authenticated)" on public.facturation_issuer_denylist
  for select to authenticated using (true);
-- RPC add (on conflict do nothing) et remove (delete), security definer + garde de rôle +
-- char_length(p_issuer) < 4 → return, sur le modèle de facturation_issuer_codes_learn.
```

Propager dans `facturation_corrections.sql` (rename/merge/delete d'émetteur) via le garde
`if to_regclass('public.facturation_issuer_denylist') is not null then …`.

### 2. Wrappers TS + modèle pur

- `cloudService.ts` : `fetchIssuerDenylist(): Record<string, Set<string>>`, `addIssuerDeny`,
  `removeIssuerDeny` (RPC). Dégradation gracieuse si table absente.
- `issuerDenylist.ts` (pur) : type + `isDenied(model, issuerKey, code)`, `mergeDenylist`.

### 3. Garde dans la détection

- `IssuerHint` gagne `deny?: Set<string>`. `issuerHintFor` (board) le remplit depuis le
  cache denylist.
- `detect.ts` : retirer les codes déniés de `weighted`/`scored` AVANT `preselect`/`scores`,
  ET des `ruleCodes`/`strong` de la couche 1 (sinon une règle ré-injecte un code banni).

### 4. Sémantique (D5, option A)

- Poser une interdiction PURGE aussi le compteur positif : `unlearnIssuerCodes(issuer,
  [code])` en plus de `denylist_add` — pas de signal contradictoire.

### 5. Chargement UI

- `useFacturationModel` : 4e `useQuery(['facturation','issuerDenylist'], fetchIssuerDenylist)`.

### 6. Tests

- `isDenied` ; `detect` avec une denylist → le code banni est absent des candidats (même si
  les mots le soutiennent ou qu'une règle le vise).

## Ordre d'exécution

1. SQL (table + RPC) + patch corrections. Demander à l'utilisateur d'exécuter (denylist puis
   corrections). L'assistant n'exécute JAMAIS le SQL.
2. Wrappers + `issuerDenylist.ts`.
3. Garde dans `detect` + `IssuerHint` + `issuerHintFor`.
4. `useFacturationModel` (query).
5. Tests. `npx tsc --noEmit` puis `npx vitest run`.

## Critère de validation

- Un code dénié pour un émetteur n'apparaît jamais dans ses candidats (mots OU règle).
- SQL ré-exécutable, écriture hors RPC impossible, garde de rôle présente.
- Dégradation gracieuse si la table n'est pas déployée.
- `npx tsc --noEmit` et `npx vitest run` verts.

## Contrôle /borg

- **Sécurité RLS/RPC** : denylist en RLS + seule policy SELECT ; RPC add/remove en
  `security definer` + garde `get_user_role()` + `search_path = public`.
- **Isolation / réversibilité** : table nouvelle, préfixée, sans FK/trigger sur les tables
  partagées ; rollback = `drop table` + ré-exécuter l'ancienne version de corrections.
- **Cohérence** : rename/merge/delete d'émetteur propagent la denylist (pas d'interdiction
  orpheline) ; la purge du compteur positif (D5) laisse un modèle cohérent.
- **Détection** : le garde retire bien le code banni de TOUTES les sources (mots + règle).
