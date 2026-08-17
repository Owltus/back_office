# Étape 3 — Feuille du jour literie (commentaire + clôture)

## Objectif

Créer la table qui porte, par jour, un commentaire libre et un statut de
clôture — même principe que `rapro_sheets`, demandé explicitement par
l'utilisateur pour le bas de page literie. À l'issue, un jour peut être
commenté puis clôturé/réouvert, avec signature serveur.

## Contexte

Réplique directe du pattern `caisse_stamp()`/`rapro_sheets` (cf. rapport
d'exploration RLS/permissions) : `validated_at`/`validated_by` posés
**côté serveur**, jamais acceptés du client — sinon un `super_utilisateur`
pourrait post-dater la validation pour contourner la fenêtre de grâce, ou
signer sous l'identité d'un tiers.

## Fichier(s) impacté(s)

- `supabase/literie_sheets.sql` (nouveau) — table + trigger + RLS (policies
  en étape 5)

## Travail à réaliser

### 1. Table

```sql
create table if not exists public.literie_sheets (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null unique,
  comment       text not null default '',
  status        text not null default 'draft'
                  check (status in ('draft', 'validated')),
  validated_at  timestamptz,
  validated_by  uuid,
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

### 2. Trigger d'estampillage serveur

Copie quasi conforme de `caisse_stamp()` (`supabase/caisse_sheets.sql:93`) :
`updated_at` toujours réécrit, `created_by` figé après l'INSERT,
`validated_at`/`validated_by` posés à la transition vers `'validated'` et
remis à `null` à la réouverture.

```sql
create or replace function public.literie_sheets_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'validated' then
      new.validated_at := now();
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else
    new.created_by := old.created_by;
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;
        new.validated_by := old.validated_by;
      end if;
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists literie_sheets_stamp on public.literie_sheets;
create trigger literie_sheets_stamp
  before insert or update on public.literie_sheets
  for each row execute function public.literie_sheets_stamp();
```

### 3. RLS

`enable row level security`, sans policy dans ce fichier (autorité unique =
`page_permissions_rls*.sql`, étape 5).

## Ordre d'exécution

1. L'utilisateur exécute `literie_sheets.sql` dans Supabase → SQL Editor.
   Indépendant des étapes 1, 2 et 4 (aucune FK).

## Critère de validation

- `insert into literie_sheets (report_date) values (current_date)` puis
  `update ... set status = 'validated'` pose bien `validated_at`/
  `validated_by` côté serveur (vérifier qu'un `validated_at` envoyé
  manuellement dans l'UPDATE est bien ignoré/écrasé).
- Repasser `status` à `'draft'` remet `validated_at`/`validated_by` à `null`.
- Réexécution du fichier sans erreur.

## Contrôle /borg

Étape critique (CREATE TABLE + trigger en PRODUCTION, logique de
signature/verrou). Audit post-exécution :
- `validated_at`/`validated_by`/`created_by` réellement non falsifiables
  depuis le client (tenter un UPDATE avec ces colonnes forcées, vérifier
  qu'elles sont écrasées par le trigger).
- `search_path = public` figé sur `literie_sheets_stamp()`.
- Contrainte `unique(report_date)` empêche deux feuilles pour le même jour.
