# Étape 1 — Diagnostic RLS/fonctions en base (lecture seule)

## Objectif

Établir l'état RÉEL de la sécurité en prod (que le dépôt ne connaît pas) avant tout
correctif : dumper les policies, les définitions des fonctions SECURITY DEFINER, et
trancher pour chaque faille conditionnelle (C1, H1, G1/G2) s'il y a réellement quelque
chose à corriger. Aucune écriture. C'est le prérequis strict de toutes les étapes SQL.

## Contexte

Le SQL est joué à la main, sans migrations : `profiles`, `get_user_role`,
`admin_update_password`, `daily_reports`, `forecast_days`, `budget`, `hotel_config`,
`audit_log` n'ont aucune définition versionnée. Un `drop policy if exists "<nom deviné>"`
laisse silencieusement en place une policy permissive dont le nom diffère — mode d'échec
n°1. On ne devine rien : on lit d'abord.

## Fichier(s) impacté(s)

- `doc/rapport securité/etat-policies-prod.md` (rafraîchi)

## Travail à réaliser

### 1. Dumper l'état des policies et fonctions (SQL Editor, lecture seule)

```sql
-- a) Toutes les policies, par table
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- b) Toute table dont la RLS serait désactivée (attendu : 0 ligne)
select relname from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
  and not relrowsecurity;

-- c) C1 — garde de admin_update_password + get_user_role
select pg_get_functiondef('public.admin_update_password'::regprocedure);
select pg_get_functiondef('public.get_user_role'::regprocedure);

-- d) G1/G2 — anti-escalade profiles : policies + trigger
select policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'profiles';
select tgname from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;

-- e) H1 — lectures encore trop larges (attendu après Étape 2 : seul hotel_config)
select tablename, policyname, qual
from pg_policies
where schemaname = 'public' and cmd = 'SELECT'
  and (qual = 'true' or qual ilike '%auth.uid() IS NOT NULL%')
order by tablename;
```

### 2. Consigner et trancher

Remplir `etat-policies-prod.md` avec les résultats, puis marquer pour chaque item :
- **C1** : la 1re ligne de `admin_update_password` contrôle-t-elle bien le rôle admin
  (`SECURITY DEFINER` + `search_path=public` figé) ? Sinon → à réécrire en Étape 3.
- **G1/G2** : `profiles` a-t-elle la policy self-update avec `role = rôle_actuel` ET le
  trigger anti-escalade ? Sinon → à rétablir en Étape 3.
- **H1** : lister les tables encore en `true`/`auth.uid() IS NOT NULL` → périmètre exact
  de l'Étape 2.

### 3. Nettoyage (manuel, dashboard) — M2

Supprimer du **SQL Editor Supabase** tout brouillon sauvegardé du type
« Disable row-level security on profiles » : un clic par mégarde ouvre la table des rôles.

## Ordre d'exécution

1. Lancer les requêtes a→e dans le SQL Editor.
2. Remplir `etat-policies-prod.md`.
3. Supprimer le brouillon dangereux (M2).

## Critère de validation

- `etat-policies-prod.md` liste toutes les tables (≥ 21) et toutes les policies.
- Verdict écrit pour C1, G1/G2 et le périmètre H1.
- Requête (b) renvoie 0 ligne (aucune table sans RLS).
- Le brouillon « Disable RLS on profiles » n'existe plus dans le SQL Editor.

## Contrôle /borg

Étape prérequis dont l'échec est silencieux : auditer que le dump est **complet**
(aucune table du code sans ligne correspondante dans le dump), que les noms de policies
relevés seront ceux réutilisés tels quels dans les `drop policy` des Étapes 2/3/4 (aucun
nom deviné), et que le verdict C1/G1-G2 est explicite (pas « probablement OK »).
