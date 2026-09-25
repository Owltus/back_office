# Étape 1 — Base : schéma Postgres, triggers, RLS, seed

## Objectif

Recréer les 7 tables de Registre (+ l'historique de fusion) dans Supabase,
avec les pratiques du projet : RLS par page `classeur` à trois niveaux,
estampillage d'auteur par trigger via `private.keep_author`, aucun privilège
pour `anon`, aucune fonction `security definer` dans `public`.

## Fichier(s) impacté(s)

- `supabase/classeur_2026-09-25.sql` (nouveau, autorité unique)

## Travail à réaliser

### 1. Tables

| Table | Rôle | Particularités |
|-------|------|----------------|
| `classeur_classeurs` | conteneur | `name`, `icon`, `etablissement`, `etablissement_complement`, `sort_order`, `uuid`, `deleted_at` |
| `classeur_chapters` | chapitre | `classeur_id` FK cascade, `label`, `icon`, `description`, `sort_order`, `uuid`, `deleted_at` |
| `classeur_periodicites` | référentiel | `label`, `nombre` (colonnes du tableau de suivi), `sort_order` ; seed de 9 lignes |
| `classeur_documents` | Markdown | `chapter_id` FK cascade, `title`, `description`, `content`, `sort_order`, `uuid`, `deleted_at` |
| `classeur_tracking_sheets` | suivi périodique | `periodicite_id` FK |
| `classeur_signature_sheets` | émargement | `nombre` (lignes, défaut 14) |
| `classeur_intercalaires` | séparateur | titre + description |
| `classeur_merge_history` | instantanés | `snapshot jsonb`, compteurs, `source_name` |

Toutes portent `created_at`, `updated_at`, `created_by uuid references
profiles(id) on delete set null` (sauf le référentiel). Index sur chaque FK,
partiels sur `deleted_at is null`.

### 2. Trigger d'estampillage

Une seule fonction `public.classeur_stamp()` (invoker, `search_path`
figé, fermée à PUBLIC/anon/authenticated), posée `before insert or update`
sur les 7 tables : `created_by = auth.uid()` à l'insertion, figé ensuite par
`private.keep_author`, `updated_at = now()`.

### 3. RLS

Modèle `literie.sql` : appels enveloppés en `(select …)`.

- lecture : `page_level_rank(get_page_level('classeur')) >= 1` sur tout ;
- écriture (`insert`, `update`) : `>= 2` sur classeurs, chapitres, les 4
  types d'éléments, l'historique (insert seul) ;
- `delete` physique : `= 'gestion'` sur classeurs et historique ; la
  suppression courante est douce (`update deleted_at`).
- `classeur_periodicites` : lecture seule pour tous les niveaux.

### 4. Vérification (fin de script, lecture seule)

8 tables présentes, RLS activée sur les 8, 0 policy `to public`, trigger
posé 7 fois, fonction trigger non exécutable par anon/authenticated, 9
périodicités, `anon` sans privilège sur les 8 tables.

## Ordre d'exécution

1. Écrire et committer le fichier.
2. `supabase db query --linked -f supabase/classeur_2026-09-25.sql`.
3. Lire la vérification ; rejouer `verif_advisor.sql`.

## Critère de validation

- Toutes les lignes de vérification à `true`.
- `verif_advisor.sql` toujours à zéro.

## Contrôle /borg

- Aucune policy `using (true)`, aucune `to public`.
- Garde de niveau écrite `>= n`, jamais `<> 'gestion'`.
- `anon` sans aucun privilège sur les nouvelles tables et séquences.
