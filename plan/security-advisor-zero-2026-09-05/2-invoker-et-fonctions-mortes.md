# Étape 2 — `dismiss_send_reminder` en invoker et suppression des fonctions sans appelant

## Objectif

Appliquer la bonne pratique « droits de l'appelant » là où elle ne change
rien au modèle (une fonction), et supprimer les trois fonctions que plus
personne n'appelle, après confirmation explicite.

## Contexte

- `dismiss_send_reminder` (`repjour_send_reminder_dismiss.sql:21`) : garde
  `page_level_rank(get_page_level('repjour')) >= 2`, écrit une colonne de
  `daily_reports` ; la policy UPDATE de `daily_reports` est strictement la
  même condition. En `security invoker`, la RLS fait le travail, la garde
  interne reste comme message d'erreur lisible.
- `set_parking_tarif` (`parking_tarifs.sql:52`), `literie_record_movement`
  (`literie.sql:88`), `literie_toggle_bedding` (`literie.sql:124`) : aucun
  appel dans `src/` ni `supabase/functions/` (agent front). La literie écrit
  `hotel_rooms` directement ; le stock est abandonné (`src/lib/literie/types.ts:17-18`).
  `parking_tarifs` se modifie par le SQL Editor (aucune UI).

## Fichier(s) impacté(s)

- `supabase/rpc_invoker_2026-09.sql` (nouveau)

## Travail à réaliser

### 1. Conversion

```sql
create or replace function public.dismiss_send_reminder(p_date date)
returns void language plpgsql security invoker set search_path = public as $$
… corps inchangé, garde `(select private.page_level_rank(private.get_page_level('repjour'))) >= 2` …
$$;
revoke execute on function public.dismiss_send_reminder(date) from public, anon;
grant execute on function public.dismiss_send_reminder(date) to authenticated;
```

Preuve : compte `lecture` repjour → `permission denied`/exception de garde ;
compte `ecriture` → succès (en transaction annulée).

### 2. Suppression (après confirmation explicite de l'utilisateur)

```sql
drop function if exists public.set_parking_tarif(numeric, numeric, date);
drop function if exists public.literie_toggle_bedding(smallint, boolean);
drop function if exists public.literie_record_movement(smallint, text, text, smallint);
```

Si l'utilisateur préfère les garder : elles suivent l'étape 3 (privé +
relais) et cette section devient sans objet.

## Ordre d'exécution

1. Fichier, commit, essai à blanc.
2. Question à l'utilisateur pour le `drop` (angle 1 de l'index).
3. Application, contrôle.

## Critère de validation

- `dismiss_send_reminder` : `prosecdef = false`, appel depuis RepJour
  (bouton « Ignorer » du bandeau d'envoi) fonctionne pour un compte
  `ecriture`, refusé pour `lecture`.
- Les trois fonctions supprimées n'apparaissent plus dans `pg_proc` ; la
  page /literie fonctionne (elle n'en dépendait pas).

## Contrôle qualité (revue)

Étape critique (`drop function` en prod). `/borg` n'étant pas installé,
revue manuelle ciblée : (1) grep final de `src/` et `supabase/functions/`
sur les trois noms = 0 ; (2) aucune policy ni trigger ne référence ces
fonctions (`pg_depend`) ; (3) le `drop` est annoncé et confirmé.
