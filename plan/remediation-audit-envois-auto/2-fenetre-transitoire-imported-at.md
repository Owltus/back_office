# Étape 2 — Fermer la fenêtre transitoire `imported_at`

## Objectif

Empêcher que, juste après la migration `imported_at` (jouée aujourd'hui), un
Forecast périmé soit considéré comme « frais » et déclenche un envoi auto sur des
chiffres d'un ancien import.

## Contexte

`forecast_days_imported_at.sql` a ajouté la colonne avec `default now()`. Toutes
les lignes existantes ont donc pris l'instant de la migration → elles paraissent
importées « ce cycle » pendant ~12 h. Comme la migration est déjà en base, la
fenêtre est ACTIVE : si un Comparison arrive seul avant le prochain Forecast réel,
l'auto pourrait partir avec un projeté périmé. Le prochain import Forecast réel
ré-estampille et referme la fenêtre, mais on veut la fermer proprement maintenant.

## Fichier(s) impacté(s)

- `supabase/forecast_days_reset_imported_at.sql` (nouveau)

## Travail à réaliser

### 1. Script SQL ponctuel (exécuté par l'utilisateur, avec confirmation)

Remettre les lignes existantes à un horodatage ancien : elles ne seront plus
jamais « fraîches » tant qu'un import réel ne les a pas ré-estampillées. Choix
conservateur : on ne peut pas distinguer une ligne backfillée d'un vrai import
récent du jour, donc on remet TOUT à l'ancien — un vrai import à venir corrige.
Conséquence acceptée : si un Forecast a été réellement importé aujourd'hui sans
ré-import ce soir, son mois sera « pas frais » jusqu'au prochain import (donc pas
d'auto-send sur ce mois d'ici là — comportement prudent, pas de fausse donnée).

```sql
-- forecast_days_reset_imported_at.sql
-- Ferme la fenetre transitoire ouverte par le backfill default now().
-- MASS UPDATE cible (imported_at seulement) -> CONFIRMATION requise avant exec.
-- A EXECUTER PAR L'UTILISATEUR. Ne touche aucune donnee metier (occ/rev/...).
update public.forecast_days
  set imported_at = timestamptz '2000-01-01 00:00:00+00';

-- Verification :
--   select count(*) as total,
--          count(*) filter (where imported_at > now() - interval '12 hours') as frais
--   from public.forecast_days;   -- attendu : frais = 0
```

## Ordre d'exécution

1. Créer le fichier SQL.
2. Présenter le script à l'utilisateur avec la mention « mass UPDATE, à confirmer ».
3. L'utilisateur exécute dans Supabase SQL Editor.

## Critère de validation

- Après exécution : `frais = 0` (aucune ligne < 12 h).
- Au prochain import Forecast réel, les lignes du mois repassent fraîches → auto OK.

## Contrôle /borg

Étape critique (mass UPDATE). Vérifier :
- Le `UPDATE` ne touche QUE `imported_at` (aucune colonne métier `occ`/`rev_*`).
- Pas de `WHERE` accidentellement destructeur ailleurs ; réexécutable sans dommage.
- Cohérence avec le garde-fou de `autoSend.ts` (fenêtre 12 h) : `2000-01-01` est
  bien hors fenêtre.
