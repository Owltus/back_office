# Étape 2 — Diagnostic de la base live (lecture seule)

## Objectif

Lever les incertitudes que l'analyse statique ne peut pas trancher : plusieurs
objets de sécurité ne sont PAS versionnés dans le dépôt (policy INSERT de
`profiles`, corps réel de `get_user_role`), et l'ordre d'application réel des
policies en prod est inconnu. Cette étape produit un état daté de la base qui
GATE les étapes 3 à 7 : on ne corrige pas à l'aveugle.

## Contexte

Le dépôt encode l'intention, pas l'état réel de la base. Écrire un `drop policy`
sur un nom deviné, ou réécrire une fonction dont on n'a pas le corps live, est le
mode d'échec n°1 d'un durcissement (déjà signalé par les plans du 20/07 et du
27/07). Tout ici est en LECTURE SEULE — aucun risque prod.

## Fichier(s) impacté(s)

- `doc/pentest-2026-08-04/etat-base-2026-08-04.md` (nouveau, résultat des requêtes)

## Travail à réaliser

À exécuter par l'utilisateur dans Supabase -> SQL Editor, puis coller les résultats
dans le fichier d'état.

### 1. Policies de `profiles` (tranche E1)

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd;
```

Question clé : existe-t-il une policy `INSERT` ? Si oui, borne-t-elle `role`
(clause `with_check` contenant `role = 'utilisateur'` ou `is_admin()`) ? Sinon,
E1 est confirmé Élevé et l'Étape 3 doit créer cette policy.

### 2. Corps réel de `get_user_role` (tranche F3)

```sql
select pg_get_functiondef('public.get_user_role()'::regprocedure);
```

Récupère la définition exacte (avec `security definer` / `set search_path`) pour la
coller à l'identique dans `security_core.sql` à l'Étape 4.

### 3. Ordre/état réel des policies d'écriture et de lecture

```sql
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('parking_reservations','pdj_breakfasts','pms_daily_metrics',
                    'rapro_rooms','rapro_sheets','caisse_sheets','daily_reports')
order by tablename, cmd, policyname;
```

Vérifie la PRÉSENCE des policies `(page:...)` et l'ABSENCE des anciennes
`(super/admin)` / `read (authenticated) using(true)`. Cela dit si le revert
silencieux (M1) a déjà eu lieu ou non.

### 4. Lignes email non conformes (prérequis F2)

```sql
select id, email
from public.email_recipients
where email !~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$';
```

Le CHECK de l'Étape 6 échouera si cette requête renvoie des lignes -> les corriger
d'abord.

### 5. Tables sans RLS (contrôle de non-régression)

```sql
select relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

Doit renvoyer 0 ligne (hors tables volontairement ouvertes documentées).

## Ordre d'exécution

1. Exécuter les 5 requêtes.
2. Coller les résultats dans `doc/pentest-2026-08-04/etat-base-2026-08-04.md`.
3. Annoter chaque finding DB (E1, F3, M1, F2) : « déjà clos en prod » ou « à corriger ».

## Critère de validation

- Le fichier d'état existe et répond, pour chaque étape DB à venir, à la question
  « y a-t-il vraiment quelque chose à corriger, et sur quel nom exact ? ».
- Décision E1 tranchée (Élevée si aucune policy INSERT bornée, sinon versionnement seul).
