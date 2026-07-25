# Étape 6 — Historique des imputations en base + mémoire émetteur dérivée

## Objectif

Enregistrer chaque facture imputée (émetteur + couples code/compte, sans PDF ni montant) dans un historique consultable, et dériver la mémoire émetteur→couples de cet historique (source unique).

## Contexte

Aujourd'hui la validation « apprend » (compteurs) et journalise (`facturation_learned_docs`), mais il n'y a pas d'historique d'imputations structuré. Décision : historique OUI, sans stocker le PDF (pas de bucket, pas de PII lourde). Décision D2 : mémoire émetteur = vue d'agrégation de l'historique.

## Fichier(s) impacté(s)

- `supabase/facturation_invoices.sql` (nouveau : header + lignes + vue mémoire + RPC)
- `src/lib/facturation/history.ts` (nouveau : modèle + service)
- `src/lib/facturation/cloudService.ts` (modification : enregistrement + lecture historique)

## Travail à réaliser

### 1. Tables

```sql
create table if not exists public.facturation_invoices (
  id uuid primary key default gen_random_uuid(),
  doc_hash text unique,
  issuer text,
  issuer_display text not null default '',
  method text not null default 'native' check (method in ('native','ocr')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.facturation_invoice_lines (
  invoice_id text not null references public.facturation_invoices(id) on delete cascade,
  code_analytique text not null,
  compte text not null,
  primary key (invoice_id, code_analytique, compte)
);
```

- Trigger `_stamp` (created_by = auth.uid()), modèle `security_hardening_triggers.sql`. RLS lecture authentifiée ; écriture RPC.

### 2. Vue mémoire émetteur

```sql
create or replace view public.facturation_issuer_memory as
  select i.issuer, l.code_analytique, l.compte, count(*)::int as n
  from public.facturation_invoices i
  join public.facturation_invoice_lines l on l.invoice_id = i.id
  where i.issuer is not null
  group by i.issuer, l.code_analytique, l.compte;
```

### 3. RPC + service

`record_invoice(hash, issuer, method, lines jsonb)` (garde de rôle + `search_path`). `history.ts` : `recordInvoice`, `fetchHistory`, `fetchIssuerMemory`.

## Ordre d'exécution

1. L'utilisateur exécute `facturation_invoices.sql` dans Supabase.
2. `history.ts` + `cloudService`.
3. Branchement de l'enregistrement au moment du tampon (étape 7).

## Critère de validation

- Valider une facture crée 1 header + N lignes.
- `facturation_issuer_memory` renvoie les couples par émetteur, classés par `n`.
- Redéposer la même facture (même `doc_hash`) ne duplique pas.

## Contrôle /borg

Étape critique (nouvelles tables + vue en PRODUCTION). Audit post-exécution :
- `created_by` posé par le trigger serveur (jamais par le client).
- RLS lecture OK ; aucune écriture directe (RPC only).
- La vue hérite bien de la RLS des tables sous-jacentes (lecture authentifiée).
- Croissance de l'historique surveillée (pas de purge automatique ici).
