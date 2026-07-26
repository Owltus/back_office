# Étape 4 — Contrainte de format sur `email_recipients` (M4)

## Objectif

Empêcher qu'une adresse stockée contenant `?`, `&`, `#`, `;`, `,`, `<`, `>`, `"` ou une
espace détourne l'URL `mailto:` construite côté client (sujet/corps/destinataires
cachés). Seule garantie **non contournable** : un `CHECK` en base (la validation client
reste contournable via la clé anon + PostgREST direct).

## Contexte

Le `mailto:` RFC 6068 a déjà été durci côté client lors du pentest du 20/07. Le maillon
manquant est la contrainte SQL : elle est **écrite mais commentée** dans
`email_recipients_rls_hardening.sql:113-141`, avec un avertissement — un `CHECK` posé sur
une table dont des lignes violent déjà la condition **échoue** et annule toute la
transaction. On contrôle donc d'abord, puis on applique séparément.

## Fichier(s) impacté(s)

- `supabase/email_recipients_email_format.sql` (nouveau : extrait exécutable du CHECK)

## Travail à réaliser

### 1. Extraire le CHECK dans son propre fichier

Reprendre tel quel le bloc `email_recipients_rls_hardening.sql:120-135` dans un fichier
dédié `email_recipients_email_format.sql`, en deux temps explicites :

```sql
-- Étape 1 — contrôler d'abord (doit renvoyer 0 ligne)
select id, email, name, type, active
from public.email_recipients
where email !~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$';

-- Étape 2 — seulement si 0 ligne, exécuter séparément
alter table public.email_recipients
  drop constraint if exists email_recipients_email_format;
alter table public.email_recipients
  add constraint email_recipients_email_format
  check (email ~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$');
```

### 2. Si le contrôle remonte des lignes

Ce sont de VRAIES adresses de destinataires : les lire et les **corriger à la main**,
ne jamais les supprimer par réflexe. Puis réexécuter le contrôle → 0 ligne → appliquer.

## Ordre d'exécution

1. Créer `email_recipients_email_format.sql`.
2. Utilisateur : exécuter le contrôle (Étape 1 du fichier).
3. Si 0 ligne → exécuter l'`alter table` (Étape 2) **dans un batch séparé**.

## Critère de validation

- Un `insert`/`update` direct (clé anon, compte gestion) d'une adresse contenant `;` ou
  `?` est **rejeté** par la contrainte.
- Les adresses légitimes existantes passent toutes (contrôle à 0 ligne avant apply).
- Le bouton « Envoyer par email » de `/repjour` fonctionne toujours (non-régression).

## Contrôle /borg

`ALTER TABLE ADD CONSTRAINT` : auditer que le contrôle préalable a bien renvoyé 0 ligne
(sinon l'apply échoue et emporte la transaction), et que la contrainte n'a pas été jouée
dans le même batch que d'autres DDL (isolation exigée par le commentaire d'origine).
