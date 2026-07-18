# Étape 4 — Correction & désapprentissage

## Objectif

Donner de quoi RÉPARER une pollution déjà écrite : désapprendre une facture (décrément
symétrique), renommer / fusionner / supprimer un émetteur pollué, et proposer un
« annuler l'apprentissage » en séance. Les écritures étant additives et décrémentables,
la correction est arithmétique — il manque seulement les outils.

## Contexte

Diagnostic DB : il n'existe AUCUNE RPC de suppression/décrément/renommage/fusion ; le
seul retrait est `prune` (global, destructif, non ciblé). Les écritures sont additives et
monotones ; un décrément est possible avec `greatest(0, count - delta)` et une contrainte
`count >= 0` (D7). Aucun journal des deltas → on reconstitue le delta depuis `record.text`
tant que la facture est ouverte (D5). Contrainte projet : SQL exécuté par l'UTILISATEUR,
RPC `SECURITY DEFINER` à garde de rôle, aucune écriture directe.

## Fichier(s) impacté(s)

- `supabase/facturation_corrections.sql` (nouveau, exécuté par l'utilisateur)
- `src/lib/facturation/cloudService.ts` (wrappers client)
- `src/components/facturation/InvoicePanel.tsx` (undo en séance)

## Travail à réaliser

### 1. RPC de correction (SQL, exécuté par l'utilisateur)

Fichier `facturation_corrections.sql`, même patron que l'existant (`create or replace
function`, `security definer`, `set search_path = public`, garde
`get_user_role() in ('super_utilisateur','admin')`, ré-exécutable). Plus une contrainte
`check (count >= 0)` sur `facturation_wordpool.count` (D7).

```sql
-- Décrément symétrique de _learn (borné à 0, purge des lignes vidées).
create or replace function public.facturation_wordpool_unlearn(
  p_codes text[], p_deltas jsonb) returns void as $$
begin
  if get_user_role() not in ('super_utilisateur','admin') then
    raise exception 'not authorized';
  end if;
  update public.facturation_wordpool w
     set count = greatest(0, w.count - d.value::int), updated_at = now()
    from unnest(p_codes) as c(code), jsonb_each_text(p_deltas) as d(key, value)
   where w.code = c.code and w.token = d.key;
  delete from public.facturation_wordpool where count <= 0;
end; $$ language plpgsql security definer set search_path = public;

-- Renommage d'émetteur (name = PK) : fusion additive puis suppression de l'ancien.
create or replace function public.facturation_issuer_rename(
  p_old_name text, p_new_name text, p_display text) returns void as $$ ... $$;

-- Fusion de deux émetteurs (doublon d'orthographe).
create or replace function public.facturation_issuer_merge(
  p_from_name text, p_to_name text, p_display text) returns void as $$ ... $$;

-- Suppression d'un émetteur erroné.
create or replace function public.facturation_issuer_delete(p_name text) returns void as $$ ... $$;
```

### 2. Wrappers client (`cloudService.ts`)

`unlearnClouds(codes, deltas)`, `renameIssuer(old, new, display)`, `mergeIssuer(from, to,
display)`, `deleteIssuer(name)` — mêmes conventions que `learnClouds`/`learnIssuer`
(propage l'erreur, best-effort côté appelant). Dégradation gracieuse si les RPC ne sont
pas encore déployées (l'appel échoue → message, pas de crash).

### 3. « Annuler l'apprentissage » en séance (InvoicePanel)

Après un tamponnage ayant appris (`record.learned === true`), proposer un bouton
« Annuler l'apprentissage » qui : reconstitue le delta depuis `record.text` (même
`countTokens` + `addStrong(SUPPLIER_WEIGHT)` qu'à l'apprentissage, D5), appelle
`unlearnClouds(record.codes, deltas)` et, si émetteur appris, `deleteIssuer`/décrément,
puis `onPatch({ learned: false })` et revert du patch optimiste (`setQueryData`). Tant que
les RPC ne sont pas déployées, l'undo se limite au cache client (le signaler).

## Ordre d'exécution

1. Écrire `facturation_corrections.sql` (à exécuter par l'utilisateur) + contrainte `count >= 0`.
2. Wrappers `cloudService.ts`.
3. Bouton « Annuler l'apprentissage » en séance (reconstitution du delta).

## Critère de validation

- Le fichier SQL est ré-exécutable, chaque fonction porte la garde de rôle, `unlearn` borne à 0 et purge les lignes vidées.
- Après un apprentissage, « Annuler » reconstitue le bon delta et décrémente (vérifiable une fois les RPC déployées) ; sans RPC déployées, l'app ne casse pas.
- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` passent (le code TS build même sans SQL exécuté).

## Contrôle /borg

Étape critique (nouveau DDL/fonctions). Auditer :
- Toutes les RPC : garde `get_user_role()` présente, `security definer`, `search_path = public`, aucune policy d'écriture directe ajoutée.
- `unlearn` : `greatest(0, ...)` + `check (count >= 0)` → pas de compteur négatif ; `delete count <= 0` ne laisse pas de lignes mortes.
- `rename`/`merge` : add-then-delete atomique (une RPC = une transaction), pas d'état intermédiaire incohérent, `count` conservé.
- Cohérence de normalisation : `p_name`/`p_tokens` passés aux RPC utilisent les MÊMES règles (`normalizeIssuer`/`tokenize`) que les clés stockées.
- Dégradation gracieuse : RPC absentes / rôle insuffisant → l'app reste utilisable, échec signalé, aucune écriture directe.
