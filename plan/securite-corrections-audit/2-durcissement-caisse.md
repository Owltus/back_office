# Étape 2 — Durcissement de la caisse (verrou 24 h + identité serveur)

## Objectif

Neutraliser F1 (contournement du verrou 24 h par post-datage de `validated_at`) et F2-caisse (falsification de `validated_by` / `created_by`) en rendant ces colonnes SERVEUR : un trigger `BEFORE INSERT/UPDATE` les estampille avec `now()` et `auth.uid()`, si bien que la valeur envoyée par le client est ignorée.

## Contexte

Aujourd'hui `src/lib/caisse/service.ts:198-204` envoie `validated_at: new Date().toISOString()` et `validated_by: userId` ; aucun trigger ni `CHECK` ne les borne (le trigger actuel ne pose que `updated_at`). Un `super_utilisateur` peut valider avec `validated_at = '2099-01-01'` : `USING` passe (ancienne ligne `validated_at is null`), `WITH CHECK` passe (`now() < 2099 + 24h`), et la fenêtre de grâce ne se referme jamais. La policy `UPDATE` à condition temporelle (`supabase/caisse_sheets.sql:122-140`) reste CORRECTE une fois `validated_at` fiable — on ne la modifie pas, on fiabilise seulement son entrée.

## Fichier(s) impacté(s)

- `supabase/caisse_sheets.sql` (script réécrit, EXÉCUTÉ PAR L'UTILISATEUR ; idempotent)

## Travail à réaliser

### 1. Fonction trigger d'estampillage (remplace le trigger `updated_at` seul)

```sql
create or replace function public.caisse_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();                     -- création figée à l'appelant
    if new.status = 'validated' then
      new.validated_at := now();                      -- horodatage SERVEUR, jamais le client
      new.validated_by := auth.uid();
    else
      new.validated_at := null;
      new.validated_by := null;
    end if;
  else -- UPDATE
    new.created_by := old.created_by;                 -- created_by non réécrivable
    if new.status = 'validated' then
      if old.status is distinct from 'validated' then
        new.validated_at := now();                    -- (re)validation → maintenant
        new.validated_by := auth.uid();
      else
        new.validated_at := old.validated_at;         -- déjà validée : figée, pas de post-datage
        new.validated_by := old.validated_by;
      end if;
    else -- réouverture (draft)
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists caisse_sheets_set_updated_at on public.caisse_sheets;
drop trigger if exists caisse_sheets_stamp on public.caisse_sheets;
create trigger caisse_sheets_stamp
  before insert or update on public.caisse_sheets
  for each row execute function public.caisse_stamp();
```

### 2. Policy `UPDATE` — inchangée

La policy `"caisse update (role + verrou)"` reste telle quelle : la clause temporelle `now() < validated_at + interval '24 hours'` est désormais fiable puisque `validated_at` est posé par le trigger. Aucun changement.

### 3. Note — `countersigned_by`

Aucun chemin applicatif ne l'écrit aujourd'hui. Quand la contre-signature sera implémentée, l'estampiller de même (`new.countersigned_by := auth.uid()` à la transition null → non-null) plutôt que l'accepter du client.

## Ordre d'exécution

1. Réécrire `supabase/caisse_sheets.sql` (assistant) : ajouter `caisse_stamp()` + trigger, remplacer le trigger `updated_at`.
2. L'utilisateur exécute le script dans Supabase → SQL Editor.
3. Vérifier le comportement (voir critères).

## Critère de validation

- Un `super_utilisateur` qui poste `validated_at` futur voit la valeur écrasée par `now()` (le verrou 24 h s'applique donc réellement).
- Après 24 h, un `super_utilisateur` ne peut plus éditer une feuille validée ; un `admin` le peut toujours (policy inchangée).
- `validated_by` et `created_by` reflètent l'appelant réel, non une valeur client.
- Script idempotent (ré-exécutable sans effet de bord).

## Contrôle /borg

Étape critique (`CREATE TRIGGER`, logique de verrou comptable). /borg doit auditer : le trigger n'empêche pas une validation légitime ; la réouverture (draft) réinitialise bien `validated_at/by` ; `created_by` ne peut plus changer après création ; la policy `UPDATE` reste cohérente avec le nouveau flux ; pas de régression sur `updated_at`.
