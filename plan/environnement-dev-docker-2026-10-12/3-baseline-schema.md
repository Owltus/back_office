# Étape 3 — Baseline du schéma

## Objectif

Une migration de départ, `supabase/migrations/<horodatage>_baseline.sql`, qui
reconstruit sur une base VIDE le schéma exact de la prod (`public` et
`private`), sans aucune donnée.

## Contexte

Le dépôt ne permet pas de reconstruire le schéma : le socle n'a jamais été
versionné, et l'ordre de rejeu n'existe pas (rapport base, 2026-10-12). Le
seul témoin fidèle est la prod elle-même.

## Fichier(s) impacté(s)

- `supabase/migrations/<AAAAMMJJHHMMSS>_baseline.sql` (nouveau)

## Travail à réaliser

1. Dump du schéma (D3-A, D4-A), première exception du garde (D5-B), confirmé
   dans le chat :
   ```bash
   PROD_CONFIRME=1 supabase db dump --project-ref ozpavwghrmmkrnmkxodg \
     --schema public,private -f supabase/migrations/<ts>_baseline.sql
   ```
   ⚠ CLI vérifiée le 2026-10-13 : `db dump`, `db push`, `migration repair`
   et `migration list` n'ont PAS de `--project-ref` ; seulement `--linked`
   ou `--db-url` (connexion Postgres directe). Le poste étant délié, le dump
   se fait par une liaison TEMPORAIRE (`link` puis `unlink`, comme
   `livrer`), lancée par l'utilisateur s'il faut le mot de passe (D19).
   Par défaut, `db dump` ne sort QUE le schéma (`--data-only` serait l'inverse).
   Avant tout commit, vérifier par `grep -i "^copy\|insert into"` qu'il
   n'y a aucune donnée.
2. Relire le fichier : il ne doit contenir aucun mot de passe ni secret, ni
   d'objet propre à Supabase dupliqué (`grant … to supabase_admin`,
   extensions déjà créées par la stack → `create extension if not exists`).
3. `supabase db reset` sur la base locale. Il doit passer sans erreur ; tout
   échec est corrigé DANS la baseline, avec un commentaire.
4. En-tête du fichier : source (dump du AAAA-MM-JJ), ce qui en a été retiré
   et pourquoi, la règle « la vérité du schéma est désormais
   `supabase/migrations/` ».

## Implications propres

- Lecture en prod : une connexion `pg_dump`, catalogue seulement.
- Le fichier fait plusieurs milliers de lignes, en un seul commit (il ne se
  relit pas en diff ; on le contrôle par les empreintes de l'étape 6).

## Phase de test /martin

- Oracle : empreinte chiffrée de l'étape 0 (tables, policies, fonctions,
  triggers par schéma) = même requête en local. L'écart doit être nul ou
  expliqué.
- Absence de données : `grep` des motifs PII de l'étape 0 sur le fichier,
  0 résultat.

## Critère de validation

- `supabase db reset` vert, deux fois de suite.
- Empreinte `public` / `private` identique au relevé.
- Commit sans push.

## Contrôle /borg

- Aucune fonction `security definer` sans `search_path` figé (contrôle
  `verif_advisor`).
- Aucun `grant … to anon` absent de la prod.
- `private` non exposé.
- Aucune donnée dans le fichier.
