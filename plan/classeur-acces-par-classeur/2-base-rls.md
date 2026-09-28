# Étape 2 — RLS de toutes les tables, stockage, gardes, journal

## Objectif

Faire respecter les règles **par la base**, sur TOUT ce qui porte du contenu
d'un classeur. Masquer un classeur dans la liste ne suffit pas (audit, trou
n° 1) : images, médiathèque, points de restauration et historique des
versions le laisseraient lire.

## Fichier(s) impacté(s)

- `supabase/classeur_acces_2026-09-28.sql` (sections 3 à 7)
- `supabase/classeur_2026-09-25.sql` (autorité, même bloc)
- `supabase/classeur_images_2026-09-26.sql` (policy de lecture du stockage)
- `supabase/classeur_versions_documents_2026-09-27.sql` (policy de lecture)

## Travail à réaliser

### 1. Lecture (remplace « rang ≥ 1 » partout)

| Table | Nouvelle condition de lecture |
|---|---|
| `classeur_classeurs` | `classeur_lecture_ok(id)` |
| `classeur_chapters` | `classeur_lecture_ok(classeur_id)` |
| `classeur_documents`, `_tracking_sheets`, `_signature_sheets`, `_intercalaires` | `classeur_chapter_read_ok(chapter_id)` |
| `classeur_merge_history` (instantanés complets !) | `classeur_lecture_ok(classeur_id)` |
| `classeur_images` | `classeur_lecture_ok(classeur_id)` |
| `classeur_document_versions` | `classeur_lecture_ok(classeur_id)` |
| `storage.objects` bucket `classeur-images` | `classeur_lecture_ok(dossier)` (premier segment du chemin) |
| `classeur_periodicites` | inchangé (référentiel) |
| `classeur_acces` | ses propres lignes, ou gestion |

### 2. Écriture

Les policies d'écriture de contenu passent déjà par `classeur_write_ok` /
`classeur_chapter_write_ok` : réécrire ces deux fonctions (étape 1) suffit.

`classeur_acces` : insert / update / delete **gestion seule**.

### 3. Gardes sur `classeur_classeurs` (trigger `before update`)

Ce que la RLS « ligne » ne sait pas distinguer :

- `acces_tous` modifié → gestion seule ;
- `deleted_at` posé (suppression douce du classeur) → gestion seule ;
- `sort_order` modifié (ordre de la LISTE) → gestion seule ;
- à l'**insert** par un non-gestionnaire : `acces_tous` forcé à `lecture`
  (l'option « Privé » est réservée à la gestion).

Refus = `raise exception … using errcode = '42501'` (lu par `messageErreur`).

### 4. Points de restauration

- delete : inchangé (gestion, ou points `auto` par l'écriture) ;
- « vider l'historique » et « restaurer » : gestion, **côté interface**
  (voir `00-INDEX.md`, angles à clarifier).

### 5. Journal

`private.log_row_change` (existant) posé en `after insert or update or
delete` sur `classeur_acces`, et en `after update of acces_tous` sur
`classeur_classeurs`. Vérifier que le CHECK de `audit_log.action` accepte
`INSERT` / `UPDATE` / `DELETE` (incident du 2026-09-04 : un CHECK trop strict
avait bloqué des écritures).

### 6. RPC « personnes ayant accès à la page »

`private.classeur_personnes()` + relais `public.classeur_personnes()`
(`security invoker`, convention du projet) : gestion seule ; rend `id`,
prénom, nom, droit de page, pour les comptes ayant un droit sur la page
Classeur. **Jamais l'e-mail.**

### 7. Privilèges

`classeur_acces` : `revoke all from public, anon` ; `grant select, insert,
update, delete to authenticated` (sous RLS) ; séquence idem.

## Critère de validation

- SQL commité, pas encore joué.
- `verif_advisor.sql` mis à jour : les nouvelles aides (`classeur_niveau`,
  `classeur_lecture_ok`, `classeur_chapter_read_ok`, `classeur_gestion_ok`)
  dans la liste des aides (contrôles 7 à 9), la RPC `classeur_personnes`
  avec son relais.

## Contrôle /borg

- AUCUNE policy de lecture restée à « rang ≥ 1 » sur une table de contenu
  (requête sur `pg_policies`).
- Le stockage : lecture d'une image d'un classeur interdit → refus.
- Le trigger de garde ne bloque pas les écritures système (fusion,
  restauration par la gestion, `keep_author`).
- Aucun `drop … cascade`, aucune donnée réécrite hors `acces_tous` par défaut.
