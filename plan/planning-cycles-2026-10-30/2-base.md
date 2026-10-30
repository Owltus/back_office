# Étape 2 — Un minimum pour la nuit

## Objectif

Les consignes de présence admettent la nuit, à côté du matin et du soir.

## Dépend de

Étape 1.

## Fichiers

- `supabase/migrations/<horodatage>_planning_consigne_nuit.sql` (nouveau)
- `supabase/tests/05_planning*.sql`
- `src/lib/planning/types.ts` (`Consigne.periode`)

## Travail

```sql
alter table public.planning_consignes
  drop constraint planning_consignes_periode_check;
alter table public.planning_consignes
  add constraint planning_consignes_periode_check
  check (periode in ('matin', 'soir', 'nuit'));
```

CHECK retiré puis recréé sous le même nom (ne compte pas comme un retrait,
décision du 2026-10-27). Aucune donnée écrite par la migration.

## Critère de validation

- `supabase migration up --local`, `supabase test db` vert, `db diff` vide.
- pgTAP : nuit acceptée, valeur inconnue refusée.

## Contrôle /borg

Nom exact de la contrainte relu dans le catalogue avant d'écrire la migration.
